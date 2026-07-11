import { describe, expect, it } from "vitest";
import { MONOGRAM_SHAPES } from "./monogram-data";

describe("baked monogram data", () => {
  it("has the frame ring plus L and K shapes (v5 lockup)", () => {
    expect(MONOGRAM_SHAPES).toHaveLength(3);
  });
  it("bakes the frame as a ring — exactly one shape carries exactly one hole", () => {
    const withHoles = MONOGRAM_SHAPES.filter((s) => s.holes.length > 0);
    expect(withHoles).toHaveLength(1);
    expect(withHoles[0].holes).toHaveLength(1);
  });
  it("is normalized to roughly [-1.5, 1.5] and centered", () => {
    const all = MONOGRAM_SHAPES.flatMap((s) => [...s.points, ...s.holes.flat()]);
    expect(all.length).toBeGreaterThan(10);
    expect(all.length).toBeLessThan(600);
    for (const [x, y] of all) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.5);
    }
    const ys = all.map(([, y]) => y);
    expect(Math.max(...ys)).toBeCloseTo(1, 1);
    expect(Math.min(...ys)).toBeCloseTo(-1, 1);
  });
  it("every contour is a real polygon", () => {
    for (const s of MONOGRAM_SHAPES) expect(s.points.length).toBeGreaterThanOrEqual(4);
  });
});
