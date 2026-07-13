import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limiterSizeForTests, POST, resetLimiterForTests } from "./route";

const sendMock = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({ id: "email-id" }), { status: 200 })),
);

function makeReq(
  body: unknown,
  opts: { ip?: string | null; contentType?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": opts.contentType ?? "application/json",
  };
  if (opts.ip !== null) headers["x-real-ip"] = opts.ip ?? "9.9.9.9";
  return new Request("http://test.local/api/contact", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Jane Doe",
    email: "jane@agency.co",
    message: "We need a rescue for a client site.",
    company_website: "",
    elapsedMs: 5000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", sendMock);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("CONTACT_TO_EMAIL", "owner@example.com");
  vi.stubEnv("RESEND_FROM", "Portfolio <onboarding@resend.dev>");
  sendMock.mockClear();
  resetLimiterForTests();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("request guards", () => {
  it("rejects a non-JSON content type with 400", async () => {
    const res = await POST(makeReq("name=x", { contentType: "text/plain" }));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(makeReq("{not json", {}));
    expect(res.status).toBe(400);
  });

  it("rejects missing fields with per-field errors", async () => {
    const res = await POST(makeReq({ name: "", email: "", message: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(Object.keys(body.errors)).toEqual(expect.arrayContaining(["name", "email", "message"]));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects control characters in name (subject injection guard)", async () => {
    const res = await POST(makeReq(validBody({ name: "x\r\nBcc: spam@evil.co" })));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects bidi-override characters in name (subject display spoofing)", async () => {
    const res = await POST(makeReq(validBody({ name: "evil‮moc.ycnega" })));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects comma-smuggled email (reply_to steering guard)", async () => {
    const res = await POST(makeReq(validBody({ email: "a@b.co,evil@d.e" })));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects bidi/control characters in email (reply_to display spoofing guard)", async () => {
    const res = await POST(makeReq(validBody({ email: "a@b.co‮xyz" })));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects the Arabic letter mark in name (bidi guard completeness)", async () => {
    const res = await POST(makeReq(validBody({ name: "x؜y" })));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short message", async () => {
    const res = await POST(makeReq(validBody({ message: "hi" })));
    expect(res.status).toBe(400);
  });
});

describe("bot traps (fake-200, no send, no limiter consumption)", () => {
  it("honeypot filled → fake success, no send, botReason logged", async () => {
    const res = await POST(makeReq(validBody({ company_website: "https://bot.example" })));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    const logged = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('"botReason":"honeypot"'))).toBe(true);
  });

  it("too-fast submit → fake success, no send", async () => {
    const res = await POST(makeReq(validBody({ elapsedMs: 800 })));
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("MISSING elapsedMs → fake success, no send (fail-closed)", async () => {
    const body = validBody();
    delete body.elapsedMs;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("non-numeric / negative elapsedMs → fail-closed", async () => {
    for (const bad of ["5000", null, -5, Number.NaN]) {
      const res = await POST(makeReq(validBody({ elapsedMs: bad })));
      expect(res.status).toBe(200);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("rate limiting (3/10min per IP → 30/hr → 40/day global)", () => {
  it("4th request from one IP inside the window → 429 with Retry-After", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeReq(validBody(), { ip: "1.1.1.1" }));
      expect(res.status).toBe(200);
    }
    const res = await POST(makeReq(validBody(), { ip: "1.1.1.1" }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it("per-IP-rejected requests do NOT consume the global window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    // IP A: 3 pass + 7 per-IP-rejected
    for (let i = 0; i < 10; i++) await POST(makeReq(validBody(), { ip: "2.2.2.2" }));
    expect(sendMock).toHaveBeenCalledTimes(3);
    // 27 more sends across other IPs → global total 30 exactly
    for (let ipn = 0; ipn < 9; ipn++) {
      for (let i = 0; i < 3; i++) {
        const res = await POST(makeReq(validBody(), { ip: `3.3.3.${ipn}` }));
        expect(res.status).toBe(200);
      }
    }
    expect(sendMock).toHaveBeenCalledTimes(30);
    // 31st passing-per-IP request → global hourly 429 (Retry-After = 3600 under frozen clock)
    const res = await POST(makeReq(validBody(), { ip: "4.4.4.4" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("global daily cap (40) trips across hourly windows", async () => {
    vi.useFakeTimers();
    const t0 = 1_800_000_000_000;
    vi.setSystemTime(t0);
    for (let ipn = 0; ipn < 10; ipn++) {
      for (let i = 0; i < 3; i++) await POST(makeReq(validBody(), { ip: `5.5.${ipn}.1` }));
    }
    expect(sendMock).toHaveBeenCalledTimes(30);
    vi.setSystemTime(t0 + 61 * 60 * 1000); // hourly window resets, daily persists
    for (let ipn = 0; ipn < 3; ipn++) {
      for (let i = 0; i < 3; i++) await POST(makeReq(validBody(), { ip: `6.6.${ipn}.1` }));
    }
    const fortieth = await POST(makeReq(validBody(), { ip: "6.6.9.1" }));
    expect(fortieth.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(40);
    const fortyFirst = await POST(makeReq(validBody(), { ip: "6.6.9.2" }));
    expect(fortyFirst.status).toBe(429);
    expect(sendMock).toHaveBeenCalledTimes(40);
    expect(Number(fortyFirst.headers.get("Retry-After"))).toBeGreaterThan(3600);
  });

  it("evicts the soonest-expiring entry at the 500 cap and still tracks new IPs", async () => {
    vi.useFakeTimers();
    const t0 = 1_800_000_000_000;
    // Distinct insert times → distinct resetAts → the eviction POLICY is observable.
    for (let i = 0; i < 501; i++) {
      vi.setSystemTime(t0 + i * 10);
      await POST(makeReq(validBody(), { ip: `10.0.${Math.floor(i / 250)}.${i % 250}` }));
    }
    expect(limiterSizeForTests()).toBe(500);
    vi.setSystemTime(t0 + 501 * 10);
    // The 501st IP IS tracked: two more requests reach its per-IP cap...
    await POST(makeReq(validBody(), { ip: "10.0.2.0" }));
    await POST(makeReq(validBody(), { ip: "10.0.2.0" }));
    // ...and its 4th trips the PER-IP window (~600s), not a global one (~3600s+)
    const fourth = await POST(makeReq(validBody(), { ip: "10.0.2.0" }));
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers.get("Retry-After"))).toBeLessThanOrEqual(600);
    // Soonest-resetAt policy: the FIRST-inserted IP (10.0.0.0) was evicted → it
    // re-tracks fresh and passes per-IP straight into the global window (~3600s),
    // while a LATER survivor (10.0.1.200, count 1 retained) trips per-IP after
    // only two more requests — distinguishing evict-soonest from evict-newest.
    const evictedRetry = await POST(makeReq(validBody(), { ip: "10.0.0.0" }));
    expect(evictedRetry.status).toBe(429);
    expect(Number(evictedRetry.headers.get("Retry-After"))).toBeGreaterThan(600);
    await POST(makeReq(validBody(), { ip: "10.0.1.200" }));
    await POST(makeReq(validBody(), { ip: "10.0.1.200" }));
    const survivorFourth = await POST(makeReq(validBody(), { ip: "10.0.1.200" }));
    expect(survivorFourth.status).toBe(429);
    expect(Number(survivorFourth.headers.get("Retry-After"))).toBeLessThanOrEqual(600);
    // Fresh-count proof (kills evict-newest): the evicted IP's re-tracked window
    // starts at count 1, so it gets two MORE passing requests (global 429s,
    // >600s) before its per-IP window trips (<=600s). A retained count-1 entry
    // would trip one request earlier.
    const evictedR2 = await POST(makeReq(validBody(), { ip: "10.0.0.0" }));
    expect(evictedR2.status).toBe(429);
    expect(Number(evictedR2.headers.get("Retry-After"))).toBeGreaterThan(600);
    const evictedR3 = await POST(makeReq(validBody(), { ip: "10.0.0.0" }));
    expect(evictedR3.status).toBe(429);
    expect(Number(evictedR3.headers.get("Retry-After"))).toBeGreaterThan(600);
    const evictedR4 = await POST(makeReq(validBody(), { ip: "10.0.0.0" }));
    expect(evictedR4.status).toBe(429);
    expect(Number(evictedR4.headers.get("Retry-After"))).toBeLessThanOrEqual(600);

    // Newest-retention proof: the LAST pre-cap insert (10.0.1.249) kept its
    // count 1 — trips per-IP on its third request. Evict-newest would have
    // dropped it, making the third request a global 429 (>600s) instead.
    await POST(makeReq(validBody(), { ip: "10.0.1.249" }));
    await POST(makeReq(validBody(), { ip: "10.0.1.249" }));
    const newestThird = await POST(makeReq(validBody(), { ip: "10.0.1.249" }));
    expect(newestThird.status).toBe(429);
    expect(Number(newestThird.headers.get("Retry-After"))).toBeLessThanOrEqual(600);
    expect(limiterSizeForTests()).toBe(500);
  });

  it("missing x-real-ip falls back to a shared local key without throwing", async () => {
    const res = await POST(makeReq(validBody(), { ip: null }));
    expect(res.status).toBe(200);
  });
});

describe("send pipeline", () => {
  it("returns 503 unconfigured without RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("unconfigured");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the snake_case reply_to payload and returns 200", async () => {
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(200);
    const [url, init] = sendMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const payload = JSON.parse(init.body as string);
    expect(payload.to).toBe("owner@example.com");
    expect(payload.from).toBe("Portfolio <onboarding@resend.dev>");
    expect(payload.reply_to).toBe("jane@agency.co");
    expect(payload.subject).toContain("Jane Doe");
    expect(payload.text).toContain("Name: Jane Doe");
    expect(payload.text).toContain("Email: jane@agency.co");
    expect(payload.text).toContain("rescue");
    expect(payload.html).toBeUndefined();
  });

  it("maps a Resend error to 502 and logs the error name", async () => {
    sendMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ statusCode: 403, name: "validation_error", message: "testing only" }),
        { status: 403 },
      ),
    );
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(502);
    const logged = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes("validation_error"))).toBe(true);
  });

  it("maps a network/timeout failure to 502", async () => {
    sendMock.mockRejectedValueOnce(new Error("timeout"));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(502);
  });
});
