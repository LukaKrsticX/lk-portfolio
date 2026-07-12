import { describe, expect, it } from "vitest";
import { HELIX_TILT_REST, helixTiltAt, twistPlanePositions } from "./helix";

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
  it("phase-π strands are disjoint when the strip is offset off-axis", () => {
    // Simulates buildStrip: strip offset to y=RADIUS before twisting.
    const RADIUS = 0.25;
    const offset = (arr: Float32Array): Float32Array => {
      for (let i = 1; i < arr.length; i += 3) arr[i] += RADIUS;
      return arr;
    };
    const a = twistPlanePositions(offset(flatStrip()), 2, 2.25);
    const b = twistPlanePositions(offset(flatStrip()), 2, 2.25, Math.PI);
    // Nearest-vertex distance within each x column: same-index comparison would
    // miss the coincident case (the π rotation swaps the rows, index ≠ location).
    for (let j = 0; j < b.length; j += 3) {
      let min = Infinity;
      for (let i = 0; i < a.length; i += 3) {
        if (a[i] !== b[j]) continue; // same column only — x is untouched by the twist
        min = Math.min(min, Math.hypot(a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]));
      }
      expect(min).toBeGreaterThan(0.1); // coincident strands give ~0
    }
  });
});

describe("helixTiltAt", () => {
  it("every variant holds the JSX rest tilt until its first window opens", () => {
    for (const v of [null, "a", "b"] as const) {
      expect(helixTiltAt(0, v)).toBeCloseTo(HELIX_TILT_REST);
    }
    // control and a only move in the contact window
    expect(helixTiltAt(0.85, null)).toBeCloseTo(HELIX_TILT_REST);
    expect(helixTiltAt(0.85, "a")).toBeCloseTo(HELIX_TILT_REST);
    // b holds rest until the center-drift window opens at 0.22
    expect(helixTiltAt(0.22, "b")).toBeCloseTo(HELIX_TILT_REST);
  });
  it("control lands flat at -0.05 (shipped f6b94d7 behavior)", () => {
    expect(helixTiltAt(1, null)).toBeCloseTo(-0.05);
  });
  it("variant a lands near-vertical at -1.25", () => {
    expect(helixTiltAt(1, "a")).toBeCloseTo(-1.25);
  });
  it("variant b verticalizes across the drift window, holds, then completes to -1.35", () => {
    expect(helixTiltAt(0.5, "b")).toBeLessThan(-0.6); // already diagonal at center stage
    expect(helixTiltAt(0.72, "b")).toBeCloseTo(-1.05);
    expect(helixTiltAt(0.8, "b")).toBeCloseTo(-1.05); // hold between windows
    expect(helixTiltAt(1, "b")).toBeCloseTo(-1.35);
  });
  it("is continuous at every window join (no pop)", () => {
    for (const v of [null, "a", "b"] as const) {
      for (const edge of [0.22, 0.72, 0.85]) {
        expect(helixTiltAt(edge + 1e-4, v)).toBeCloseTo(helixTiltAt(edge - 1e-4, v), 3);
      }
    }
  });
});
