import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capture, resetAnalyticsForTests } from "./analytics";

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  resetAnalyticsForTests();
});

afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analytics capture", () => {
  it("no-ops without a key", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    capture("page_view", { path: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the PostHog payload shape through the relay", () => {
    capture("page_view", { path: "/" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/relay/i/v0/e/");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string);
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("page_view");
    expect(typeof body.distinct_id).toBe("string");
    expect(body.properties.$process_person_profile).toBe(false);
    expect(body.properties.path).toBe("/");
  });

  it("keeps one distinct_id across events in a pageload", () => {
    capture("page_view", { path: "/" });
    capture("scene_reached", { scene: "work" });
    const first = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(first.distinct_id).toBe(second.distinct_id);
  });

  it("swallows fetch failures (analytics never breaks UX)", () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("blocked")));
    expect(() => capture("booking_click")).not.toThrow();
  });
});
