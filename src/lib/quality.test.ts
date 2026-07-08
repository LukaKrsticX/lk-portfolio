import { describe, expect, it, vi } from "vitest";
import { supportsWebGL } from "./gl-support";
import { detectTier, heuristicTier } from "./quality";

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
  it("falls back to heuristic when detect-gpu throws", async () => {
    vi.mock("detect-gpu", () => ({ getGPUTier: () => Promise.reject(new Error("blocked")) }));
    const tier = await detectTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never);
    expect(["low", "med", "high"]).toContain(tier);
  });
});
