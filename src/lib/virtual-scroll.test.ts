import { describe, expect, it } from "vitest";
import {
  alphaEff,
  createVirtualScroll,
  easeInOutCubic,
  INERTIA_INJECT,
  WHEEL_MULT,
} from "./virtual-scroll";

/** Settle a pipeline for `secs` seconds at a fixed frame time (no input). */
function settle(vs: ReturnType<typeof createVirtualScroll>, secs: number, dt = 1 / 60): void {
  for (let t = 0; t < secs - 1e-9; t += dt) vs.step(dt);
}

describe("alphaEff", () => {
  it("is exact at dt=1/60 (one 60fps frame reproduces the raw factor)", () => {
    // Short-circuit guards the float rounding of 1-(1-a): 1-(1-0.1) !== 0.1.
    expect(alphaEff(0.5, 1 / 60)).toBe(0.5);
    expect(alphaEff(0.1, 1 / 60)).toBe(0.1);
    expect(alphaEff(0.123, 1 / 60)).toBe(0.123);
  });
  it("is 0 at dt=0 (a stalled frame moves nothing)", () => {
    expect(alphaEff(0.5, 0)).toBe(0);
  });
  it("composes across substeps: 1-(1-α(a,dt/2))² === α(a,dt) (dt-invariant remaining fraction)", () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 90, 1 / 144]) {
      const half = alphaEff(0.3, dt / 2);
      expect(1 - (1 - half) ** 2).toBeCloseTo(alphaEff(0.3, dt), 12);
    }
  });
});

describe("easeInOutCubic", () => {
  it("hits endpoints and midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
  });
  it("is monotonic non-decreasing on [0,1]", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("createVirtualScroll — seeding & basics", () => {
  it("seeds y/target from y0 with no initial velocity", () => {
    const vs = createVirtualScroll({ max: 1000, y0: 300 });
    expect(vs.y).toBe(300);
    expect(vs.target).toBe(300);
    vs.step(1 / 60);
    expect(vs.y).toBe(300); // no drift, no phantom velocity burst on landing
    expect(vs.vel).toBe(0);
  });
  it("defaults y0 to 0", () => {
    expect(createVirtualScroll({ max: 1000 }).y).toBe(0);
  });
});

describe("cascade — framerate invariance", () => {
  it("settles to the same y at 60fps and 120fps after the same wheel impulse (within 1e-3)", () => {
    const a = createVirtualScroll({ max: 100000 });
    const b = createVirtualScroll({ max: 100000 });
    a.applyWheel(500);
    b.applyWheel(500);
    settle(a, 4, 1 / 60);
    settle(b, 4, 1 / 120);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-3);
  });
  it("splitting a frame into two half-steps lands the same settled y (within 1e-3)", () => {
    const one = createVirtualScroll({ max: 100000 });
    const two = createVirtualScroll({ max: 100000 });
    one.applyWheel(800);
    two.applyWheel(800);
    for (let i = 0; i < 240; i++) one.step(1 / 60);
    for (let i = 0; i < 480; i++) two.step(1 / 120);
    expect(Math.abs(one.y - two.y)).toBeLessThan(1e-3);
  });
});

describe("cascade — no overshoot", () => {
  it("approaches the target monotonically once input stops (positive impulse)", () => {
    const vs = createVirtualScroll({ max: 100000 });
    vs.applyWheel(400);
    let prev = vs.y;
    let peak = vs.y;
    for (let i = 0; i < 600; i++) {
      vs.step(1 / 60);
      expect(vs.y).toBeGreaterThanOrEqual(prev - 1e-9); // never dips back
      prev = vs.y;
      peak = Math.max(peak, vs.y);
    }
    expect(vs.y).toBe(peak); // final == peak → never overshot then corrected
  });
  it("approaches monotonically for a negative impulse too (seeded high)", () => {
    const vs = createVirtualScroll({ max: 100000, y0: 5000 });
    vs.applyWheel(-400);
    let prev = vs.y;
    for (let i = 0; i < 600; i++) {
      vs.step(1 / 60);
      expect(vs.y).toBeLessThanOrEqual(prev + 1e-9);
      prev = vs.y;
    }
  });
});

describe("inertia", () => {
  it("one flick travels ≈ 2.2× its raw delta (WHEEL_MULT + closed-form inertia sum)", () => {
    const D = 1000;
    const vs = createVirtualScroll({ max: 1e7 });
    vs.applyWheel(D);
    settle(vs, 6);
    expect(vs.y / D).toBeGreaterThan(2.1);
    expect(vs.y / D).toBeLessThan(2.3);
  });
  it("the calibration constants imply the ≈2.2× gain (verified, not by faith)", () => {
    const total = WHEEL_MULT + INERTIA_INJECT / -Math.log(0.9);
    expect(total).toBeCloseTo(2.2, 2);
  });
  it("momentum is spent within 2s — target moves < 0.01px/frame after settling", () => {
    // The plan's "inertia decays below 0.01px within 2s": observe it on the target,
    // which the inertia term drives (the y cascade may still be catching up).
    const vs = createVirtualScroll({ max: 1e7 });
    vs.applyWheel(300);
    settle(vs, 2);
    const t0 = vs.target;
    vs.step(1 / 60);
    expect(Math.abs(vs.target - t0)).toBeLessThan(0.01);
  });
  it("fully settles (vel==0, y fixed) once the cascade catches up", () => {
    const vs = createVirtualScroll({ max: 1e7 });
    vs.applyWheel(300);
    settle(vs, 5);
    expect(vs.vel).toBe(0); // deadband snaps the rendered scroll to rest
    const rest = vs.y;
    vs.step(1 / 60);
    expect(vs.y).toBe(rest); // stays put — no residual micro-lerp
  });
});

describe("clamps", () => {
  it("keeps y and target within [0, max] under overflow and negative impulses", () => {
    const vs = createVirtualScroll({ max: 500 });
    vs.applyWheel(100000); // way past the bottom
    for (let i = 0; i < 300; i++) {
      vs.step(1 / 60);
      expect(vs.y).toBeGreaterThanOrEqual(0);
      expect(vs.y).toBeLessThanOrEqual(500);
      expect(vs.target).toBeGreaterThanOrEqual(0);
      expect(vs.target).toBeLessThanOrEqual(500);
    }
    expect(vs.y).toBeCloseTo(500, 3); // pinned at the bottom
    vs.applyWheel(-100000); // way past the top
    settle(vs, 4);
    expect(vs.y).toBeCloseTo(0, 3);
  });
  it("setMax re-clamps y/target below the new ceiling", () => {
    const vs = createVirtualScroll({ max: 5000, y0: 4000 });
    vs.setMax(1000);
    expect(vs.y).toBe(1000);
    expect(vs.target).toBe(1000);
  });
});

describe("lock / unlock", () => {
  it("ignores wheel input while locked and resumes on unlock", () => {
    const vs = createVirtualScroll({ max: 100000, y0: 200 });
    settle(vs, 0.5); // fully at rest at 200
    const before = vs.y;
    vs.lock();
    expect(vs.isLocked()).toBe(true);
    vs.applyWheel(1000);
    settle(vs, 1);
    expect(vs.y).toBe(before); // locked → wheel changed nothing
    expect(vs.target).toBe(before);
    vs.unlock();
    expect(vs.isLocked()).toBe(false);
    vs.applyWheel(1000);
    settle(vs, 2);
    expect(vs.y).toBeGreaterThan(before); // resumes
  });
});

describe("tweenTo", () => {
  it("target reaches exactly x once the duration elapses (easeInOutCubic)", () => {
    const vs = createVirtualScroll({ max: 100000 });
    vs.tweenTo(3000, 800);
    for (let i = 0; i < 50; i++) vs.step(1 / 60); // > 800ms → complete
    expect(vs.target).toBe(3000);
    settle(vs, 3);
    expect(vs.y).toBeCloseTo(3000, 2); // cascade catches up after the tween lands
  });
  it("keeps y behind the target while the tween is mid-flight (cascade smooths it)", () => {
    const vs = createVirtualScroll({ max: 100000 });
    vs.tweenTo(4000, 800);
    for (let i = 0; i < 24; i++) vs.step(1 / 60); // ~400ms in
    expect(vs.target).toBeGreaterThan(0);
    expect(vs.y).toBeLessThan(vs.target); // y trails the tweened target
  });
  it("a mid-tween wheel impulse cancels the tween (user wins)", () => {
    const vs = createVirtualScroll({ max: 5000 });
    vs.tweenTo(4000, 800);
    for (let i = 0; i < 12; i++) vs.step(1 / 60); // partway up
    expect(vs.y).toBeGreaterThan(0);
    vs.applyWheel(-40000); // hard flick back to the top
    settle(vs, 4);
    expect(vs.y).toBeCloseTo(0, 2); // landed at 0, not the abandoned 4000 target
  });
});

describe("nudge (arrow-key direct target bump)", () => {
  it("bumps the target by the exact delta and lets y ease behind it", () => {
    const vs = createVirtualScroll({ max: 100000, y0: 500 });
    settle(vs, 0.5);
    vs.nudge(60);
    expect(vs.target).toBe(560); // exact — no inertia, no 0.25× scaling
    settle(vs, 2);
    expect(vs.y).toBeCloseTo(560, 2);
  });
  it("accumulates across rapid presses within a single frame (no collapse)", () => {
    const vs = createVirtualScroll({ max: 100000, y0: 0 });
    vs.nudge(60);
    vs.nudge(60);
    vs.nudge(60);
    expect(vs.target).toBe(180); // three taps before a step → +180, not +60
  });
  it("is ignored while locked", () => {
    const vs = createVirtualScroll({ max: 100000, y0: 300 });
    vs.lock();
    vs.nudge(60);
    expect(vs.target).toBe(300);
  });
});

describe("absorb (native scroll-leak folding)", () => {
  it("folds the leaked offset into the target exactly, clamped to max", () => {
    const vs = createVirtualScroll({ max: 1000, y0: 200 });
    vs.absorb(300);
    expect(vs.target).toBe(500);
    vs.absorb(10000); // overflow leak clamps
    expect(vs.target).toBe(1000);
    settle(vs, 5);
    expect(vs.y).toBe(1000); // cascade carries the absorbed offset to rest
  });
  it("is a no-op while a tween owns the destination (absolute target — no double-apply)", () => {
    const vs = createVirtualScroll({ max: 100000 });
    vs.tweenTo(1000, 800);
    for (let i = 0; i < 6; i++) vs.step(1 / 60); // mid-flight
    vs.absorb(500); // the focus leak the tween's absolute destination already covers
    for (let i = 0; i < 60; i++) vs.step(1 / 60); // tween completes
    expect(vs.target).toBe(1000); // NOT 1500
  });
  it("is a no-op while locked", () => {
    const vs = createVirtualScroll({ max: 100000, y0: 300 });
    vs.lock();
    vs.absorb(500);
    expect(vs.target).toBe(300);
  });
});

describe("determinism", () => {
  it("replays an identical y trace for the same impulse+dt script", () => {
    const script = (vs: ReturnType<typeof createVirtualScroll>): number[] => {
      const trace: number[] = [];
      vs.applyWheel(220);
      for (let i = 0; i < 40; i++) {
        if (i === 10) vs.applyWheel(-90);
        if (i === 20) vs.tweenTo(1500, 500);
        vs.step(1 / 60);
        trace.push(vs.y);
      }
      return trace;
    };
    const a = script(createVirtualScroll({ max: 100000 }));
    const b = script(createVirtualScroll({ max: 100000 }));
    expect(b).toEqual(a);
  });
});
