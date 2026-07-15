import { describe, expect, it } from "vitest";
import { mulberry32 } from "./prng";

describe("mulberry32", () => {
  it("is deterministic: same seed replays the same sequence", () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    for (let i = 0; i < 32; i++) expect(a()).toBe(b());
  });
  it("emits values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 256; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});
