import { describe, expect, it } from "vitest";
import { PORTAL_RING, cardRel, mulberry32, ringPose, shardScatterAttrs } from "./portal";

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
  it("workP=0: card 0 faces camera (yaw 0, active)", () => {
    for (const count of [2, 5]) {
      const pose = ringPose(0, count, 0);
      expect(pose.yaw).toBeCloseTo(0, 9);
      expect(pose.active).toBe(true);
    }
  });
  it("workP=1: card count-1 faces camera (yaw 0, active)", () => {
    for (const count of [2, 5]) {
      const pose = ringPose(1, count, count - 1);
      expect(pose.yaw).toBeCloseTo(0, 9);
      expect(pose.active).toBe(true);
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
    }
  });
});

describe("cardRel", () => {
  it("workP=0 with two cards: card 0 settled, card 1 fully dust on the arriving side", () => {
    expect(cardRel(0, 2, 0)).toBe(0);
    expect(cardRel(0, 2, 1)).toBe(-1);
  });
  it("workP=1 with two cards: card 0 fully departed, card 1 settled", () => {
    expect(cardRel(1, 2, 0)).toBe(1);
    expect(cardRel(1, 2, 1)).toBe(0);
  });
  it("midpoint with two cards: card 0 half-departed, card 1 half-arrived", () => {
    expect(cardRel(0.5, 2, 0)).toBeCloseTo(0.5, 9);
    expect(cardRel(0.5, 2, 1)).toBeCloseTo(-0.5, 9);
  });
  it("is monotonic non-decreasing in workP", () => {
    for (const count of [2, 5]) {
      for (let i = 0; i < count; i++) {
        let prev = cardRel(0, count, i);
        for (let s = 1; s <= 100; s++) {
          const cur = cardRel(s / 100, count, i);
          expect(cur).toBeGreaterThanOrEqual(prev);
          prev = cur;
        }
      }
    }
  });
  it("count=5: only neighbours of the active slot sit strictly inside (-1, 1)", () => {
    // workP=0.55 → slot 2.2: card 2 mid-departure, card 3 mid-arrival,
    // everyone else saturated at ±1 (fully dust, faded out).
    expect(cardRel(0.55, 5, 0)).toBe(1);
    expect(cardRel(0.55, 5, 1)).toBe(1);
    expect(cardRel(0.55, 5, 2)).toBeCloseTo(0.2, 9);
    expect(cardRel(0.55, 5, 3)).toBeCloseTo(-0.8, 9);
    expect(cardRel(0.55, 5, 4)).toBe(-1);
  });
  it("count=5 settled slots: active card 0, both neighbours at exactly ±1", () => {
    // workP=0.5 → slot 2 exactly: the settled join of a 5-card ring.
    expect(cardRel(0.5, 5, 2)).toBe(0);
    expect(cardRel(0.5, 5, 1)).toBe(1);
    expect(cardRel(0.5, 5, 3)).toBe(-1);
  });
  it("count=1 returns 0 (a lone card stays settled)", () => {
    for (const workP of [0, 0.25, 0.5, 1]) expect(cardRel(workP, 1, 0)).toBe(0);
  });
  it("clamps: workP outside [0,1] saturates and far cards pin to ±1", () => {
    expect(cardRel(-0.5, 2, 0)).toBe(0); // clamp01(workP) floors at 0
    expect(cardRel(1.5, 2, 0)).toBe(1); // clamp01(workP) caps at 1
    expect(cardRel(1, 5, 0)).toBe(1); // slot 4, card 0 → rel 4 → clamped
    expect(cardRel(0, 5, 4)).toBe(-1); // slot 0, card 4 → rel -4 → clamped
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
