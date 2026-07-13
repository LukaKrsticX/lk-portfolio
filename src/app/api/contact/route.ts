import { site } from "@/content/site";

// Mirrors the client rule; comma/semicolon exclusion closes reply_to steering.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
// Name reaches the Resend subject — CR/LF/C0 rejection closes header injection.
const CTRL_RE = /[\r\n\x00-\x1f]/;

const MIN_ELAPSED_MS = 2000;
const PER_IP_MAX = 3;
const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const HOURLY_MAX = 30;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
// Quota guard: Resend free tier is 100/day — cap form sends well under it.
const DAILY_MAX = 40;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAP_CAP = 500;

type Window = { count: number; resetAt: number };

// Per-instance soft limits (Fluid instances share module state across
// concurrent invocations; scale-out multiplies, deploys reset). The Vercel
// WAF rule on POST /api/contact is the dashboard backstop.
const ipWindows = new Map<string, Window>();
let hourly: Window = { count: 0, resetAt: 0 };
let daily: Window = { count: 0, resetAt: 0 };

function refresh(w: Window, now: number, windowMs: number): void {
  if (now >= w.resetAt) {
    w.count = 0;
    w.resetAt = now + windowMs;
  }
}

function retryAfterSec(w: Window, now: number): number {
  return Math.max(1, Math.ceil((w.resetAt - now) / 1000));
}

/** Per-IP first; globals consumed ONLY by requests that passed per-IP. Sync throughout. */
function checkRateLimit(ip: string, now: number): { ok: true } | { ok: false; retryAfter: number } {
  let ipWin = ipWindows.get(ip);
  if (!ipWin) {
    if (ipWindows.size >= MAP_CAP) {
      // Lazy prune, then evict the soonest-expiring entry (defined policy).
      for (const [k, w] of ipWindows) if (now >= w.resetAt) ipWindows.delete(k);
      if (ipWindows.size >= MAP_CAP) {
        let soonestKey: string | null = null;
        let soonestAt = Infinity;
        for (const [k, w] of ipWindows) {
          if (w.resetAt < soonestAt) {
            soonestAt = w.resetAt;
            soonestKey = k;
          }
        }
        if (soonestKey !== null) ipWindows.delete(soonestKey);
      }
    }
    ipWin = { count: 0, resetAt: now + PER_IP_WINDOW_MS };
    ipWindows.set(ip, ipWin);
  }
  refresh(ipWin, now, PER_IP_WINDOW_MS);
  if (ipWin.count >= PER_IP_MAX) return { ok: false, retryAfter: retryAfterSec(ipWin, now) };
  ipWin.count += 1;

  refresh(hourly, now, HOURLY_WINDOW_MS);
  refresh(daily, now, DAILY_WINDOW_MS);
  // Evaluate both before consuming either — an hourly reject must not burn daily.
  if (hourly.count >= HOURLY_MAX) return { ok: false, retryAfter: retryAfterSec(hourly, now) };
  if (daily.count >= DAILY_MAX) return { ok: false, retryAfter: retryAfterSec(daily, now) };
  hourly.count += 1;
  daily.count += 1;
  return { ok: true };
}

type SubmitLog = {
  evt: "contact_submit";
  ok: boolean;
  emailDomain?: string;
  msgLen?: number;
  bot?: boolean;
  botReason?: "honeypot" | "timing";
  resendError?: string;
};

/** PII-lean submit log — source of truth for send counts (PostHog over-counts bots). */
function logSubmit(entry: SubmitLog): void {
  console.log(JSON.stringify(entry));
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ ok: false }, 400);
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ ok: false }, 400);
  }
  const body = (raw ?? {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  const errors: Record<string, string> = {};
  if (!name || name.length > 200) errors.name = "required";
  else if (CTRL_RE.test(name)) errors.name = "invalid";
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) errors.email = "invalid";
  if (message.length < 10 || message.length > 5000) errors.message = "length";
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ ok: false, errors }, 400);
  }

  const emailDomain = email.split("@")[1] ?? "";

  // Bot traps — fake success, nothing sent, limiter untouched (fail-closed timing).
  const elapsed = body.elapsedMs;
  const botReason: SubmitLog["botReason"] | null = body.company_website
    ? "honeypot"
    : typeof elapsed !== "number" || Number.isNaN(elapsed) || elapsed < MIN_ELAPSED_MS
      ? "timing"
      : null;
  if (botReason) {
    logSubmit({ evt: "contact_submit", ok: false, bot: true, botReason, emailDomain });
    return jsonResponse({ ok: true }, 200);
  }

  const ip = request.headers.get("x-real-ip") ?? "local";
  const limit = checkRateLimit(ip, Date.now());
  if (!limit.ok) {
    return jsonResponse({ ok: false }, 429, { "Retry-After": String(limit.retryAfter) });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logSubmit({ evt: "contact_submit", ok: false, emailDomain, msgLen: message.length, resendError: "unconfigured" });
    return jsonResponse({ ok: false, reason: "unconfigured" }, 503);
  }

  const to = process.env.CONTACT_TO_EMAIL || site.contact.email;
  const from = process.env.RESEND_FROM || "Portfolio <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Portfolio contact — ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
        // Raw API is snake_case (SDK examples use replyTo; unknown fields are ignored).
        reply_to: email,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      let resendError = `http_${res.status}`;
      try {
        const errBody = (await res.json()) as { name?: string };
        if (errBody.name) resendError = errBody.name;
      } catch {
        // non-JSON error body — keep the status-based label
      }
      logSubmit({ evt: "contact_submit", ok: false, emailDomain, msgLen: message.length, resendError });
      return jsonResponse({ ok: false }, 502);
    }
    logSubmit({ evt: "contact_submit", ok: true, emailDomain, msgLen: message.length });
    return jsonResponse({ ok: true }, 200);
  } catch {
    logSubmit({ evt: "contact_submit", ok: false, emailDomain, msgLen: message.length, resendError: "network_or_timeout" });
    return jsonResponse({ ok: false }, 502);
  }
}

export function resetLimiterForTests(): void {
  ipWindows.clear();
  hourly = { count: 0, resetAt: 0 };
  daily = { count: 0, resetAt: 0 };
}

export function limiterSizeForTests(): number {
  return ipWindows.size;
}
