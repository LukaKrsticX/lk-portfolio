import { beforeEach, describe, expect, it, vi } from "vitest";
import { supportsWebGL } from "./gl-support";
import { clampTier, demoteTier, detectTier, heuristicTier, persistTierCap, readTierCap } from "./quality";

const getGPUTierMock = vi.hoisted(() => vi.fn());
vi.mock("detect-gpu", () => ({ getGPUTier: getGPUTierMock }));

describe("supportsWebGL", () => {
  it("returns false when getContext yields null (jsdom default)", () => {
    expect(supportsWebGL()).toBe(false);
  });
});

describe("heuristicTier", () => {
  it("low on small memory", () => {
    expect(heuristicTier({ deviceMemory: 2, hardwareConcurrency: 4 } as never)).toBe("low");
  });
  it("med on mid hardware", () => {
    expect(heuristicTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never)).toBe("med");
  });
  it("high on strong hardware", () => {
    expect(heuristicTier({ deviceMemory: 16, hardwareConcurrency: 16 } as never)).toBe("high");
  });
});

describe("detectTier", () => {
  it("maps gpu tier 3 to high", async () => {
    getGPUTierMock.mockResolvedValueOnce({ tier: 3 });
    expect(await detectTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never)).toBe("high");
  });
  it("maps gpu tier 2 to med", async () => {
    getGPUTierMock.mockResolvedValueOnce({ tier: 2 });
    expect(await detectTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never)).toBe("med");
  });
  it("maps gpu tier 0-1 to low", async () => {
    getGPUTierMock.mockResolvedValueOnce({ tier: 1 });
    expect(await detectTier({ deviceMemory: 16, hardwareConcurrency: 16 } as never)).toBe("low");
  });
  it("falls back to heuristic when detect-gpu rejects", async () => {
    getGPUTierMock.mockRejectedValueOnce(new Error("blocked"));
    expect(await detectTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never)).toBe("med");
  });
});

describe("tier governance", () => {
  beforeEach(() => localStorage.clear());

  it("demoteTier steps down one tier and floors at low", () => {
    expect(demoteTier("high")).toBe("med");
    expect(demoteTier("med")).toBe("low");
    expect(demoteTier("low")).toBe("low");
  });

  it("clampTier caps the detected tier", () => {
    expect(clampTier("high", "med")).toBe("med");
    expect(clampTier("low", "med")).toBe("low");
    expect(clampTier("high", null)).toBe("high");
  });

  it("persist/read round-trips within the TTL", () => {
    persistTierCap("med", 1_000);
    expect(readTierCap(1_000 + 6 * 24 * 60 * 60 * 1000)).toBe("med");
  });

  it("expires after 7 days (one throttled session must not cap forever)", () => {
    persistTierCap("low", 1_000);
    expect(readTierCap(1_000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("survives garbage in storage", () => {
    localStorage.setItem("lk-tier-cap", "not-json{");
    expect(readTierCap()).toBeNull();
    localStorage.setItem("lk-tier-cap", JSON.stringify({ tier: "ultra", ts: Date.now() }));
    expect(readTierCap()).toBeNull();
  });

  it("holds at exactly the 7-day boundary (> not >=)", () => {
    persistTierCap("med", 1_000);
    expect(readTierCap(1_000 + 7 * 24 * 60 * 60 * 1000)).toBe("med");
  });

  it("rejects future timestamps (clock skew must not extend the TTL)", () => {
    persistTierCap("med", 5_000);
    expect(readTierCap(4_000)).toBeNull();
  });

  it("persistTierCap swallows storage failures", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => persistTierCap("med")).not.toThrow();
    spy.mockRestore();
  });
});
