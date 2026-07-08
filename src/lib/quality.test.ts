import { describe, expect, it, vi } from "vitest";
import { supportsWebGL } from "./gl-support";
import { detectTier, heuristicTier } from "./quality";

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
