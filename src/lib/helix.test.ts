import { describe, expect, it } from "vitest";
import { twistPlanePositions } from "./helix";

// One segment, plane of length 2 lying along x: verts at x=-1 and x=+1, y=±0.5.
function flatStrip(): Float32Array {
  return new Float32Array([-1, 0.5, 0, 1, 0.5, 0, -1, -0.5, 0, 1, -0.5, 0]);
}

describe("twistPlanePositions", () => {
  it("rotates each column around the x axis by u-proportional angle", () => {
    const pos = twistPlanePositions(flatStrip(), 2, 0.5); // half turn over the strip
    // u=0 column (x=-1): angle 0 → untouched.
    expect(pos[1]).toBeCloseTo(0.5);
    expect(pos[2]).toBeCloseTo(0);
    // u=1 column (x=+1): angle π → y flips.
    expect(pos[4]).toBeCloseTo(-0.5);
    expect(pos[5]).toBeCloseTo(0, 5);
  });
  it("preserves distance from the x axis", () => {
    const pos = twistPlanePositions(flatStrip(), 2, 1.75, 0.4);
    for (let i = 0; i < pos.length; i += 3) {
      expect(Math.hypot(pos[i + 1], pos[i + 2])).toBeCloseTo(0.5);
    }
  });
  it("applies the phase offset at u=0", () => {
    const pos = twistPlanePositions(flatStrip(), 2, 0, Math.PI); // phase only
    expect(pos[1]).toBeCloseTo(-0.5); // y flipped by the π phase
  });
});
