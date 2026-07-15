import { describe, expect, it } from "vitest";
import {
  CARD_ANGLE_STEP,
  CARD_PITCH,
  CARD_RADIUS,
  cardPose,
  cardProgress,
  lookQuat,
  quatForward,
  railWaypoint,
  ROT_CAP,
} from "./workrail";

type Vec3 = readonly [number, number, number];

const radius = (p: Vec3): number => Math.hypot(p[1], p[2]);
const angleOf = (p: Vec3): number => Math.atan2(p[2], p[1]); // in the YZ plane about the axis (local X)
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

describe("cardPose", () => {
  it("places every card on the continuity radius (== retired PORTAL_RING.radius 1.15)", () => {
    expect(CARD_RADIUS).toBeCloseTo(1.15);
    for (const N of [2, 5]) {
      for (let i = 0; i < N; i++) expect(radius(cardPose(i, N).position)).toBeCloseTo(CARD_RADIUS, 9);
    }
  });

  it("steps a constant CARD_ANGLE_STEP (−50°) between adjacent cards (N=2, unclamped)", () => {
    // N=2 angles are ±25° — inside ROT_CAP, so the angular geometry is recoverable.
    const a0 = angleOf(cardPose(0, 2).position);
    const a1 = angleOf(cardPose(1, 2).position);
    expect(a1 - a0).toBeCloseTo(CARD_ANGLE_STEP, 9);
    expect(CARD_ANGLE_STEP).toBeCloseTo((-50 * Math.PI) / 180, 9);
  });

  it("centers the set about the axis origin (N=2 symmetric along the axis)", () => {
    expect(cardPose(0, 2).position[0]).toBeCloseTo(-CARD_PITCH / 2, 9);
    expect(cardPose(1, 2).position[0]).toBeCloseTo(+CARD_PITCH / 2, 9);
  });

  it("steps a constant CARD_PITCH along the axis (local X) between adjacent cards", () => {
    for (const N of [2, 5]) {
      for (let i = 0; i < N - 1; i++) {
        expect(cardPose(i + 1, N).position[0] - cardPose(i, N).position[0]).toBeCloseTo(CARD_PITCH, 9);
      }
    }
  });

  it("honors the yaw cap: |rotationY| ≤ ROT_CAP, and far cards clamp exactly (N=5)", () => {
    for (let i = 0; i < 5; i++) expect(Math.abs(cardPose(i, 5).rotationY)).toBeLessThanOrEqual(ROT_CAP + 1e-12);
    // centered(0,5) = −2 → angle +100° → clamps to +ROT_CAP; centered(4,5) = +2 → −100° → −ROT_CAP.
    expect(cardPose(0, 5).rotationY).toBeCloseTo(ROT_CAP, 9);
    expect(cardPose(4, 5).rotationY).toBeCloseTo(-ROT_CAP, 9);
    expect(cardPose(2, 5).rotationY).toBeCloseTo(0, 9); // center card faces straight
  });

  it("is N-generic and NaN-free for N=2 and N=5", () => {
    for (const N of [2, 5]) {
      for (let i = 0; i < N; i++) {
        const { position, rotationY } = cardPose(i, N);
        for (const v of position) expect(Number.isFinite(v)).toBe(true);
        expect(Number.isFinite(rotationY)).toBe(true);
      }
    }
  });

  it("is pure (same args → same pose)", () => {
    expect(cardPose(1, 5)).toEqual(cardPose(1, 5));
  });
});

describe("cardProgress", () => {
  it("is a linear index 0..N−1, exact integer at each card center", () => {
    for (const N of [2, 5]) {
      for (let i = 0; i < N; i++) {
        const workP = N > 1 ? i / (N - 1) : 0;
        expect(cardProgress(workP, N)).toBeCloseTo(i, 9);
      }
    }
  });

  it("is monotonic non-decreasing in workP", () => {
    for (const N of [2, 5]) {
      let prev = cardProgress(0, N);
      for (let s = 1; s <= 100; s++) {
        const cur = cardProgress(s / 100, N);
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    }
  });

  it("clamps workP outside [0,1] (no overshoot past the last card index)", () => {
    expect(cardProgress(-1, 5)).toBe(0);
    expect(cardProgress(2, 5)).toBe(4);
  });
});

describe("lookQuat / quatForward", () => {
  it("orients −z (camera forward) exactly along (look − pos)", () => {
    const pos: Vec3 = [0.5, 0.2, 3.0];
    const look: Vec3 = [0, 0, -1];
    const fwd = quatForward(lookQuat(pos, look));
    const want = norm3([look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]]);
    expect(dot3(fwd, want)).toBeCloseTo(1, 6);
  });

  it("returns a unit quaternion", () => {
    const q = lookQuat([1, 2, 3], [0, 0, 0]);
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 9);
  });
});

describe("railWaypoint", () => {
  it("faces the card it is diving toward at each card center (forward ≈ look − pos)", () => {
    for (const N of [2, 5]) {
      for (let i = 0; i < N; i++) {
        const workP = N > 1 ? i / (N - 1) : 0;
        const wp = railWaypoint(workP, N);
        const fwd = quatForward(wp.quat);
        const want = norm3([wp.look[0] - wp.pos[0], wp.look[1] - wp.pos[1], wp.look[2] - wp.pos[2]]);
        expect(dot3(fwd, want)).toBeCloseTo(1, 6);
      }
    }
  });

  it("is continuous in workP — NO snap at card boundaries (floor+fract stays smooth)", () => {
    for (const N of [2, 5]) {
      let prev = railWaypoint(0, N);
      for (let s = 1; s <= 400; s++) {
        const cur = railWaypoint(s / 400, N);
        // per-step deltas stay tiny — a snap would show up as a jump here.
        expect(Math.abs(cur.pos[0] - prev.pos[0])).toBeLessThan(0.05);
        expect(Math.abs(cur.pos[2] - prev.pos[2])).toBeLessThan(0.05);
        expect(Math.abs(cur.look[0] - prev.look[0])).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it("dollies inward across the span (camera z decreases from start to end)", () => {
    for (const N of [2, 5]) {
      expect(railWaypoint(1, N).pos[2]).toBeLessThan(railWaypoint(0, N).pos[2]);
    }
  });

  it("is N-generic, finite, and carries a constant work fov + parallax", () => {
    for (const N of [2, 5]) {
      const a = railWaypoint(0, N);
      const b = railWaypoint(1, N);
      for (const v of [...a.pos, ...a.look, ...b.pos, ...b.look]) expect(Number.isFinite(v)).toBe(true);
      expect(a.fov).toBe(b.fov);
      expect(a.moveXY.length).toBe(2);
    }
  });

  it("is pure (same args → same waypoint)", () => {
    expect(railWaypoint(0.37, 2)).toEqual(railWaypoint(0.37, 2));
  });
});
