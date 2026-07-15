import { describe, expect, it } from "vitest";
import {
  BURST_DRAG,
  BURST_EXPIRY,
  BURST_SLOTS,
  BURST_SPEED,
  burstOffset,
  burstSpeedFor,
  buildSeeds,
  createBurstManager,
  POOL_SIZE,
  seedToBurstDir,
  type Vec3,
} from "./particles";

const mag = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

describe("POOL_SIZE (D4 tier pools)", () => {
  it("is 16384 / 8192 / 2048 for high / med / low", () => {
    expect(POOL_SIZE.high).toBe(16384);
    expect(POOL_SIZE.med).toBe(8192);
    expect(POOL_SIZE.low).toBe(2048);
  });
  it("is strictly monotone across tiers (a demote always shrinks the pool)", () => {
    expect(POOL_SIZE.high).toBeGreaterThan(POOL_SIZE.med);
    expect(POOL_SIZE.med).toBeGreaterThan(POOL_SIZE.low);
  });
});

describe("seedToBurstDir", () => {
  it("returns a unit vector for any seed pair", () => {
    for (let a = 0; a < 1; a += 0.137) {
      for (let b = 0; b < 1; b += 0.113) {
        expect(mag(seedToBurstDir(a, b))).toBeCloseTo(1, 9);
      }
    }
  });
  it("is upward-biased: y is always positive (a burst sprays up, never a flat disc)", () => {
    for (let a = 0; a < 1; a += 0.05) {
      for (let b = 0; b <= 1; b += 0.05) {
        expect(seedToBurstDir(a, b)[1]).toBeGreaterThan(0);
      }
    }
  });
  it("is deterministic (pure function of the seed)", () => {
    expect(seedToBurstDir(0.3, 0.7)).toEqual(seedToBurstDir(0.3, 0.7));
  });
  it("azimuth sweeps the full circle: xz direction rotates with the first seed", () => {
    const d0 = seedToBurstDir(0, 0.5);
    const dq = seedToBurstDir(0.25, 0.5); // +90° azimuth
    // the xz projections should be ~perpendicular (dot ≈ 0)
    expect(d0[0] * dq[0] + d0[2] * dq[2]).toBeCloseTo(0, 6);
  });
});

describe("burstOffset (closed-form ballistic + drag + gravity)", () => {
  const up: Vec3 = [0, 1, 0];
  const side: Vec3 = [1, 0, 0];

  it("is exactly the origin at τ=0", () => {
    for (const o of [burstOffset(seedToBurstDir(0.4, 0.6), 2.4, 0), burstOffset(up, 5, 0)]) {
      expect(o[0]).toBeCloseTo(0, 12);
      expect(o[1]).toBeCloseTo(0, 12);
      expect(o[2]).toBeCloseTo(0, 12);
    }
  });

  it("apex is sane: an up-launched particle rises to a positive max, then falls back", () => {
    const speed = 3;
    // sample y over the lifetime
    let maxY = -Infinity;
    let maxT = 0;
    for (let t = 0; t <= BURST_EXPIRY; t += 0.01) {
      const y = burstOffset(up, speed, t)[1];
      if (y > maxY) {
        maxY = y;
        maxT = t;
      }
    }
    expect(maxY).toBeGreaterThan(0); // it goes up
    expect(maxT).toBeGreaterThan(0); // apex is after launch
    expect(maxT).toBeLessThan(BURST_EXPIRY); // and before it dies — a real arc, not monotone
    // beyond the apex it is descending
    expect(burstOffset(up, speed, maxT + 0.3)[1]).toBeLessThan(maxY);
  });

  it("drag bounds the horizontal spread by speed/k and converges to it", () => {
    const speed = 4;
    const bound = speed / BURST_DRAG;
    let last = 0;
    for (let t = 0; t <= 6; t += 0.05) {
      const x = burstOffset(side, speed, t)[0];
      expect(x).toBeLessThanOrEqual(bound + 1e-9); // never overshoots the drag bound
      expect(x).toBeGreaterThanOrEqual(last - 1e-9); // monotone approach (no drag oscillation)
      last = x;
    }
    expect(burstOffset(side, speed, 20)[0]).toBeCloseTo(bound, 3); // → speed/k
  });

  it("gravity pulls y below zero eventually (terminal fall present, not a pure lofting toy)", () => {
    expect(burstOffset(up, 0.2, 6)[1]).toBeLessThan(0);
  });

  it("is deterministic and linear in speed for the horizontal impulse term", () => {
    const a = burstOffset(side, 2, 1)[0];
    const b = burstOffset(side, 4, 1)[0];
    expect(b).toBeCloseTo(2 * a, 9);
  });

  it("burstSpeedFor scales with strength and the seed spread (0.6×..1.0×)", () => {
    expect(burstSpeedFor(1, 1)).toBeCloseTo(BURST_SPEED, 9);
    expect(burstSpeedFor(1, 0)).toBeCloseTo(BURST_SPEED * 0.6, 9);
    expect(burstSpeedFor(0.5, 1)).toBeCloseTo(BURST_SPEED * 0.5, 9);
  });
});

describe("burst manager ring (4 slots, oldest-evict, 2.5s expiry)", () => {
  const P: Vec3 = [1, 2, 3];

  it("holds up to BURST_SLOTS live bursts", () => {
    const m = createBurstManager();
    for (let i = 0; i < BURST_SLOTS; i++) m.emit([i, 0, 0], 1, i * 0.1);
    expect(m.activeCount(0.4)).toBe(BURST_SLOTS);
  });

  it("evicts the OLDEST when a 5th burst arrives within the window (newest 4 survive)", () => {
    const m = createBurstManager();
    // five bursts, all inside one 2.5s window, x = 0..4 as a recency tag
    for (let i = 0; i < 5; i++) m.emit([i, 0, 0], 1, i * 0.2);
    const { slots, strengths } = m.uniformsAt(1.0);
    const liveX: number[] = [];
    for (let i = 0; i < BURST_SLOTS; i++) if (strengths[i] > 0) liveX.push(slots[i * 4]);
    liveX.sort((a, b) => a - b);
    expect(liveX).toEqual([1, 2, 3, 4]); // the x=0 (oldest) burst was evicted
  });

  it("reuses an expired slot before evicting a live one", () => {
    const m = createBurstManager();
    m.emit([9, 9, 9], 1, 0); // will expire by t=3
    for (let i = 0; i < BURST_SLOTS - 1; i++) m.emit([i, 0, 0], 1, 3 + i * 0.1); // 3 fresh, at t≈3
    // the t=0 burst is expired at t=3.2; a 4th fresh burst must reuse it, not evict a live one
    m.emit([7, 0, 0], 1, 3.3);
    const { slots, strengths } = m.uniformsAt(3.3);
    const live = [] as number[];
    for (let i = 0; i < BURST_SLOTS; i++) if (strengths[i] > 0) live.push(slots[i * 4]);
    expect(live).toContain(7);
    expect(live).not.toContain(9); // the expired burst is gone, all four fresh bursts are live
    expect(m.activeCount(3.3)).toBe(BURST_SLOTS);
  });

  it("reports a slot inert exactly at/after the expiry horizon", () => {
    const m = createBurstManager();
    m.emit(P, 1, 0);
    expect(m.activeCount(BURST_EXPIRY - 0.01)).toBe(1);
    expect(m.activeCount(BURST_EXPIRY + 0.01)).toBe(0);
    // and never counts a future burst (negative age)
    m.emit(P, 1, 10);
    expect(m.activeCount(5)).toBe(0);
  });

  it("uniformsAt strength is 0 for empty slots and carries xyz+t0 for live ones", () => {
    const m = createBurstManager();
    m.emit(P, 0.8, 2);
    const { slots, strengths } = m.uniformsAt(2.5);
    // find the live slot
    let idx = -1;
    for (let i = 0; i < BURST_SLOTS; i++) if (strengths[i] > 0) idx = i;
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(strengths[idx]).toBeCloseTo(0.8);
    expect([slots[idx * 4], slots[idx * 4 + 1], slots[idx * 4 + 2], slots[idx * 4 + 3]]).toEqual([1, 2, 3, 2]);
    // the other three slots are inert
    expect([...strengths].filter((s) => s > 0)).toHaveLength(1);
  });

  it("uniformsAt reuses its output buffers (no per-frame allocation)", () => {
    const m = createBurstManager();
    expect(m.uniformsAt(0).slots).toBe(m.uniformsAt(1).slots);
    expect(m.uniformsAt(0).strengths).toBe(m.uniformsAt(1).strengths);
  });
});

describe("buildSeeds (mulberry32 attribute layout)", () => {
  it("emits count×4 floats in [0,1)", () => {
    const s = buildSeeds(10);
    expect(s).toHaveLength(40);
    for (const v of s) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("is deterministic for a given base seed and diverges for another", () => {
    expect([...buildSeeds(4)]).toEqual([...buildSeeds(4)]);
    expect([...buildSeeds(4)]).not.toEqual([...buildSeeds(4, 12345)]);
  });
  it("a prefix of a larger pool equals the smaller pool (stream is stable across pool sizes)", () => {
    const small = buildSeeds(8);
    const big = buildSeeds(64);
    expect([...big.slice(0, 32)]).toEqual([...small]);
  });
});
