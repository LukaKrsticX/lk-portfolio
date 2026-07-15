import { describe, expect, it } from "vitest";
import {
  createPortalMachine,
  cubicBezier,
  EXIT_THRESHOLD,
  type PortalTracks,
} from "./portal-tween";

// The wipe timing curve — the machine drives wipeT through exactly this bezier, so the tests
// compute their own expected values from the same solver (no magic reference numbers to drift).
const wipeCurve = cubicBezier(0.29, 0.05, 0.06, 0.92);

/** Step the machine `ms` milliseconds in `nSteps` equal dt slices (dt is SECONDS). */
function stepMs(m: ReturnType<typeof createPortalMachine>, ms: number, nSteps = 1): PortalTracks {
  const dt = ms / 1000 / nSteps;
  let out: PortalTracks = { phase: m.phase, camT: m.camT, wipeT: m.wipeT, dollyT: m.dollyT };
  for (let i = 0; i < nSteps; i++) out = m.step(dt);
  return out;
}

describe("cubicBezier solver", () => {
  it("is pinned at the endpoints: f(0)=0, f(1)=1", () => {
    expect(wipeCurve(0)).toBeCloseTo(0, 9);
    expect(wipeCurve(1)).toBeCloseTo(1, 9);
    // A symmetric ease still pins endpoints.
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBeCloseTo(0, 9);
    expect(ease(1)).toBeCloseTo(1, 9);
  });

  it("is monotonic non-decreasing across [0,1] (Newton + bisection stays stable)", () => {
    let prev = wipeCurve(0);
    for (let i = 1; i <= 200; i++) {
      const cur = wipeCurve(i / 200);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });

  it("clamps outside [0,1]", () => {
    expect(wipeCurve(-0.5)).toBe(0);
    expect(wipeCurve(1.5)).toBe(1);
  });

  it("solves the linear curve to the identity (Newton converges)", () => {
    const linear = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(linear(x)).toBeCloseTo(x, 4);
  });
});

describe("portal machine — phase transitions", () => {
  it("walks closed → opening → open → closing → closed", () => {
    const m = createPortalMachine();
    expect(m.phase).toBe("closed");
    m.step(1 / 60);
    expect(m.phase).toBe("closed"); // idle steps do nothing

    m.open();
    expect(m.phase).toBe("opening");
    stepMs(m, 500);
    expect(m.phase).toBe("opening"); // wipe/dolly still running (1500ms)
    stepMs(m, 1100); // total 1600ms > max track duration
    expect(m.phase).toBe("open");
    expect(m.camT).toBe(1);
    expect(m.wipeT).toBe(1);
    expect(m.dollyT).toBe(1);

    m.close();
    expect(m.phase).toBe("closing");
    stepMs(m, 850); // > 800ms close
    expect(m.phase).toBe("closed");
    expect(m.camT).toBe(0);
    expect(m.wipeT).toBe(0);
    expect(m.dollyT).toBe(0);
  });

  it("open() is idempotent while opening/open; close() is idempotent while closing/closed", () => {
    const m = createPortalMachine();
    m.close(); // no-op from closed
    expect(m.phase).toBe("closed");
    m.open();
    stepMs(m, 300);
    const wipeMid = m.wipeT;
    m.open(); // must not restart from 0
    expect(m.wipeT).toBe(wipeMid);
    stepMs(m, 2000);
    expect(m.phase).toBe("open");
    m.close();
    stepMs(m, 200);
    const closingWipe = m.wipeT;
    m.close(); // no-op mid-close — no jump
    expect(m.wipeT).toBe(closingWipe);
  });
});

describe("portal machine — track values at known t", () => {
  it("camera track hits 1 at 700ms (easeOutCubic), wipe/dolly still mid-flight", () => {
    const m = createPortalMachine();
    m.open();
    stepMs(m, 700, 700); // fine-grained: elapsed-based easing is dt-subdivision-invariant
    expect(m.camT).toBeCloseTo(1, 9);
    expect(m.phase).toBe("opening");
    expect(m.wipeT).toBeLessThan(1);
  });

  it("wipe track follows cubic-bezier(.29,.05,.06,.92) at t=0 / 750 / 1500ms", () => {
    const m = createPortalMachine();
    m.open();
    expect(m.wipeT).toBe(0); // t=0 before any step
    stepMs(m, 750);
    expect(m.wipeT).toBeCloseTo(wipeCurve(0.5), 6);
    stepMs(m, 750);
    expect(m.wipeT).toBeCloseTo(1, 9); // t=1500 → 1
  });

  it("is invariant to dt subdivision (elapsed-based, not incrementally integrated)", () => {
    const a = createPortalMachine();
    const b = createPortalMachine();
    a.open();
    b.open();
    stepMs(a, 600, 1);
    stepMs(b, 600, 600);
    expect(a.wipeT).toBeCloseTo(b.wipeT, 9);
    expect(a.camT).toBeCloseTo(b.camT, 9);
  });
});

describe("portal machine — mid-flight close reverses from current value without jump", () => {
  it("reverses the wipe from wherever it was, first close frame ≈ start value (no jump)", () => {
    const m = createPortalMachine();
    m.open();
    stepMs(m, 400); // partial open
    const wipeAtClose = m.wipeT;
    const camAtClose = m.camT;
    expect(wipeAtClose).toBeGreaterThan(0);
    expect(wipeAtClose).toBeLessThan(1);

    m.close();
    // one tiny step: k = 1 - easeOutCubic(dt/800) ≈ 1 → wipeT ≈ start, strictly below it, never above.
    const t = stepMs(m, 4);
    expect(t.wipeT).toBeLessThan(wipeAtClose);
    expect(t.wipeT).toBeCloseTo(wipeAtClose, 1); // no visible jump on the first close frame
    expect(t.camT).toBeLessThan(camAtClose);
    // and it drives to exactly 0.
    stepMs(m, 900);
    expect(m.wipeT).toBe(0);
    expect(m.camT).toBe(0);
  });

  it("closing from full-open drives all three tracks to 0 at 800ms", () => {
    const m = createPortalMachine();
    m.open();
    stepMs(m, 1600);
    expect(m.phase).toBe("open");
    m.close();
    const mid = stepMs(m, 400);
    expect(mid.wipeT).toBeGreaterThan(0);
    expect(mid.wipeT).toBeLessThan(1);
    stepMs(m, 400);
    expect(m.phase).toBe("closed");
    expect(m.wipeT).toBe(0);
  });
});

describe("portal machine — exit gesture + determinism", () => {
  it("exitGesture fires only at/above the 1200 px/s threshold, either direction", () => {
    const m = createPortalMachine();
    expect(EXIT_THRESHOLD).toBe(1200);
    expect(m.exitGesture(1199)).toBe(false);
    expect(m.exitGesture(1200)).toBe(true);
    expect(m.exitGesture(5000)).toBe(true);
    expect(m.exitGesture(-1500)).toBe(true); // magnitude, so an upward flick exits too
    expect(m.exitGesture(-800)).toBe(false);
    expect(m.exitGesture(0)).toBe(false);
  });

  it("is deterministic: the same open/step/close script yields an identical track trace", () => {
    const script = (m: ReturnType<typeof createPortalMachine>): PortalTracks[] => {
      const trace: PortalTracks[] = [];
      m.open();
      for (let i = 0; i < 100; i++) trace.push(m.step(1 / 60));
      m.close();
      for (let i = 0; i < 60; i++) trace.push(m.step(1 / 60));
      return trace;
    };
    expect(script(createPortalMachine())).toEqual(script(createPortalMachine()));
  });

  it("supports a fast open (deep-link fast-path) that completes all tracks in the given ms", () => {
    const m = createPortalMachine();
    m.open(200);
    stepMs(m, 200);
    expect(m.phase).toBe("open");
    expect(m.wipeT).toBe(1);
    expect(m.camT).toBe(1);
  });
});
