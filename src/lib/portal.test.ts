import { describe, expect, it } from "vitest";
import {
  PORTAL_RING,
  explodeEnvelope,
  mulberry32,
  ringPose,
  shardScatterAttrs,
} from "./portal";

const TWO_PI = Math.PI * 2;

describe("PORTAL_RING", () => {
  it("exposes the shared ring knobs", () => {
    expect(PORTAL_RING.radius).toBeCloseTo(1.15);
    expect(PORTAL_RING.tiltZ).toBeCloseTo(-0.08);
  });
});

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

describe("ringPose", () => {
  it("workP=0: card 0 faces camera (yaw 0, active, settled)", () => {
    for (const count of [2, 5]) {
      const pose = ringPose(0, count, 0);
      expect(pose.yaw).toBeCloseTo(0, 9);
      expect(pose.active).toBe(true);
      expect(pose.t).toBeCloseTo(0, 9);
    }
  });
  it("workP=1: card count-1 faces camera (yaw 0, active, settled)", () => {
    for (const count of [2, 5]) {
      const pose = ringPose(1, count, count - 1);
      expect(pose.yaw).toBeCloseTo(0, 9);
      expect(pose.active).toBe(true);
      expect(pose.t).toBeCloseTo(0, 9);
    }
  });
  it("spaces cards by 2π/count and only the nearest is active", () => {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const pose = ringPose(0, count, i);
      expect(pose.yaw).toBeCloseTo((i * TWO_PI) / count, 9);
      expect(pose.active).toBe(i === 0);
    }
  });
  it("yaw is continuous across every settled join (1e-4 straddle)", () => {
    for (const count of [2, 5]) {
      // yaw moves linearly at slope (count-1)*2π/count per unit workP; a
      // continuous function may drift up to slope*straddle across the join.
      const maxDrift = ((count - 1) * TWO_PI * 2e-4) / count + 1e-9;
      for (let k = 1; k < count - 1; k++) {
        const join = k / (count - 1); // workP where slot === k
        for (let i = 0; i < count; i++) {
          const lo = ringPose(join - 1e-4, count, i).yaw;
          const hi = ringPose(join + 1e-4, count, i).yaw;
          expect(Math.abs(hi - lo)).toBeLessThan(maxDrift);
        }
      }
    }
  });
  it("t ramps 0→1 within a segment and resets at the join (wrap is masked by explodeEnvelope)", () => {
    const count = 5;
    const join = 1 / (count - 1);
    // mid-segment: t is the fractional slot progress
    expect(ringPose(join / 2, count, 0).t).toBeCloseTo(0.5, 6);
    // approaching the join t→1, past it t→0 — the saw wrap
    expect(ringPose(join - 1e-4, count, 0).t).toBeGreaterThan(0.999);
    expect(ringPose(join + 1e-4, count, 0).t).toBeLessThan(0.001);
    // composed envelope stays continuous through the wrap
    const lo = explodeEnvelope(ringPose(join - 1e-4, count, 0).t);
    const hi = explodeEnvelope(ringPose(join + 1e-4, count, 0).t);
    expect(hi).toBeCloseTo(lo, 3);
  });
  it("is scrub-safe: pure function of inputs (same args, same pose)", () => {
    const a = ringPose(0.37, 5, 2);
    const b = ringPose(0.37, 5, 2);
    expect(b).toEqual(a);
  });
  it("count=1 degenerates without division blowups", () => {
    for (const workP of [0, 0.5, 1]) {
      const pose = ringPose(workP, 1, 0);
      expect(pose.yaw).toBe(0);
      expect(pose.active).toBe(true);
      expect(pose.t).toBe(0);
    }
  });
});

describe("shardScatterAttrs", () => {
  it("is deterministic: same args produce identical arrays", () => {
    const a = shardScatterAttrs(6, 4, 42);
    const b = shardScatterAttrs(6, 4, 42);
    expect(Array.from(b.offsets)).toEqual(Array.from(a.offsets));
    expect(Array.from(b.rands)).toEqual(Array.from(a.rands));
  });
  it("sizes arrays to the shard grid (cols*rows*3 offsets, cols*rows rands)", () => {
    const { offsets, rands } = shardScatterAttrs(6, 4, 1);
    expect(offsets.length).toBe(6 * 4 * 3);
    expect(rands.length).toBe(6 * 4);
  });
  it("keeps scatter directions inside the tangent-biased bounds", () => {
    const { offsets, rands } = shardScatterAttrs(8, 8, 99);
    for (let i = 0; i < offsets.length; i += 3) {
      expect(Math.abs(offsets[i])).toBeLessThanOrEqual(1.5); // x tangent-biased
      expect(Math.abs(offsets[i + 1])).toBeLessThanOrEqual(0.6);
      expect(Math.abs(offsets[i + 2])).toBeLessThanOrEqual(0.4);
    }
    for (const r of rands) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
  it("different seeds scatter differently", () => {
    const a = shardScatterAttrs(4, 4, 1);
    const b = shardScatterAttrs(4, 4, 2);
    expect(Array.from(b.offsets)).not.toEqual(Array.from(a.offsets));
  });
});

describe("explodeEnvelope", () => {
  it("is 0 at rest on either side and 1 at the tent peak", () => {
    expect(explodeEnvelope(-1)).toBe(0);
    expect(explodeEnvelope(0)).toBe(0);
    expect(explodeEnvelope(0.5)).toBe(1);
    expect(explodeEnvelope(1)).toBe(0);
    expect(explodeEnvelope(2)).toBe(0);
  });
  it("is continuous at the joins t=0, 0.5, 1 (1e-4 straddle)", () => {
    for (const edge of [0, 0.5, 1]) {
      expect(explodeEnvelope(edge + 1e-4)).toBeCloseTo(explodeEnvelope(edge - 1e-4), 3);
    }
  });
  it("is symmetric: envelope(t) === envelope(1-t) within 1e-9", () => {
    for (let t = -0.25; t <= 1.25; t += 0.01) {
      expect(Math.abs(explodeEnvelope(t) - explodeEnvelope(1 - t))).toBeLessThan(1e-9);
    }
  });
});
