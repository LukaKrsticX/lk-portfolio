/** Hand-rolled PostHog capture — cookieless, autocapture-free, ~0.5KB (spec S5 D3). */

export type AnalyticsEvent =
  | "page_view"
  | "scene_reached"
  | "quality_tier_selected"
  | "webgl_fallback_triggered"
  | "form_submit_ok"
  | "form_submit_fail"
  | "agencies_page_view"
  | "booking_click";

/** One anonymous id per hard pageload, memory only — SPA navigation preserves it. */
let distinctId: string | null = null;

/** Fire-and-forget event to PostHog via the first-party /relay rewrite. */
export function capture(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  // Env read at CALL time (vi.stubEnv compat); Next inlines NEXT_PUBLIC_ either way.
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === "undefined") return;
  distinctId ??= crypto.randomUUID();
  fetch("/relay/i/v0/e/", {
    method: "POST",
    keepalive: true, // survives navigation/unload (booking_click, form_submit_*)
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties: {
        ...props,
        // Raw-API events are identified (4x price) by default — force anonymous.
        $process_person_profile: false,
        $current_url: window.location.href,
      },
    }),
  }).catch(() => {
    // Analytics must never break UX; ad-block rejections land here.
  });
}

export function resetAnalyticsForTests(): void {
  distinctId = null;
}
