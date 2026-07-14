// Pure scroll pipeline — no DOM, no three. The cascade the whole S6 feel rests on.
// Framerate-normalized everywhere so the curve is identical at 60/120/144Hz: alphaEff
// turns a per-60fps-frame lerp factor into a per-dt factor, and the inertia term uses
// the EXACT integral of exponential decay — Euler `inertia*dt*60` is NOT dt-invariant
// (it drifts ~5% across framerates), the closed form is (verified in the test suite).

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Per-dt lerp factor for a rate calibrated at 60fps: `1 - (1-a)^(dt·60)`.
 * Exact at dt=1/60 (returns `a`) — short-circuits the float rounding of `1-(1-a)`,
 * which is not identity for e.g. a=0.1.
 */
export function alphaEff(a: number, dt: number): number {
  const n = dt * 60;
  if (n === 1) return a;
  return 1 - Math.pow(1 - a, n);
}

/** Standard easeInOutCubic on [0,1]. Programmatic tweens (anchors/keys/focus/pop) ride this. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Feel constants — page-length-scaled; tune here (spec §3). Exported for tuning + tests.
export const WHEEL_MULT = 0.25; // immediate target nudge per wheel px
export const INERTIA_DECAY = 0.9; // per-60fps-frame momentum retention
// One flick's total travel = (WHEEL_MULT + INERTIA_INJECT · Σ) × raw delta, where the
// closed-form inertia sum Σ = 1/(-ln 0.9) = 9.4912 (the naive discrete Σ 0.9^n = 10
// over-counts; the integral is the dt-invariant truth). Solving 0.25 + 9.4912·INJECT = 2.2
// → INJECT ≈ 0.2055. Verified by the "one flick travels ≈ 2.2×" test, not by faith.
export const INERTIA_INJECT = 0.2055;

const HEAD_ALPHA = 0.5; // stage 1: head → target
const Y_ALPHA = 0.1; // stage 2: y → head (the rendered scroll)
const DEADBAND = 0.01; // px: a lerp gap below this snaps — no infinite micro-lerp
// Inertia hard-stop: kept far below DEADBAND so the (framerate-dependent) frame on which
// momentum is zeroed shifts the resting target by < 1e-6px — preserves dt-invariance to 1e-3.
const INERTIA_EPS = 1e-6;
const LN_DECAY = Math.log(INERTIA_DECAY);

export interface VirtualScroll {
  readonly y: number;
  /** Cascade/tween destination. Read-only — exposed for seeding checks and tween tests. */
  readonly target: number;
  /** px/s of the rendered `y` from the last `step`. */
  readonly vel: number;
  applyWheel(deltaPx: number): void;
  /** Direct target bump (arrow keys) — no inertia, cancels any tween, accumulates across calls. */
  nudge(deltaPx: number): void;
  /**
   * Fold an externally-applied native scroll offset (a leak the scroll-pin listener caught)
   * into the target. UNLIKE nudge it never cancels a tween: a tween's destination is
   * absolute, so the leak is already accounted for there — it must be discarded, not
   * double-applied. No-op while locked (portal-mode leaks are simply pinned away).
   */
  absorb(deltaPx: number): void;
  step(dtSec: number): void;
  tweenTo(target: number, ms: number): void;
  setMax(n: number): void;
  lock(): void;
  unlock(): void;
  isLocked(): boolean;
}

interface Tween {
  from: number;
  to: number;
  elapsedMs: number;
  durMs: number;
}

export function createVirtualScroll(opts: { max: number; y0?: number }): VirtualScroll {
  let max = Math.max(0, opts.max);
  const seed = clamp(opts.y0 ?? 0, 0, max);
  let target = seed;
  let head = seed;
  let y = seed;
  let prevY = seed;
  let inertia = 0;
  let vel = 0;
  let locked = false;
  let tween: Tween | null = null;

  return {
    get y() {
      return y;
    },
    get target() {
      return target;
    },
    get vel() {
      return vel;
    },
    applyWheel(deltaPx: number): void {
      if (locked) return; // portal mode: wheel feeds the exit detector, not the pipeline
      tween = null; // live input always wins over a programmatic tween
      target = clamp(target + deltaPx * WHEEL_MULT, 0, max);
      inertia += deltaPx * INERTIA_INJECT;
    },
    nudge(deltaPx: number): void {
      if (locked) return;
      tween = null;
      target = clamp(target + deltaPx, 0, max); // exact bump — the cascade still eases y behind it
    },
    absorb(deltaPx: number): void {
      if (locked || tween) return; // tween owns an absolute destination — discard the leak
      target = clamp(target + deltaPx, 0, max);
    },
    step(dtSec: number): void {
      prevY = y;
      if (tween) {
        tween.elapsedMs += dtSec * 1000;
        const t = tween.durMs <= 0 ? 1 : clamp(tween.elapsedMs / tween.durMs, 0, 1);
        target = clamp(tween.from + (tween.to - tween.from) * easeInOutCubic(t), 0, max);
        if (t >= 1) {
          target = tween.to; // land exactly on the destination
          tween = null;
        }
      } else {
        // Inertia over the frame: exact integral of `inertia·DECAY^(60τ)` (dt-invariant).
        const decay = Math.pow(INERTIA_DECAY, dtSec * 60);
        target = clamp(target + (inertia * (decay - 1)) / LN_DECAY, 0, max);
        inertia *= decay;
        if (Math.abs(inertia) < INERTIA_EPS) inertia = 0; // spent — hard stop for an exact settle
      }
      head += (target - head) * alphaEff(HEAD_ALPHA, dtSec);
      if (Math.abs(head - target) < DEADBAND) head = target; // snap — no micro-lerp on head
      head = clamp(head, 0, max);
      y += (head - y) * alphaEff(Y_ALPHA, dtSec);
      if (Math.abs(y - head) < DEADBAND) y = head; // full settle of the rendered scroll
      y = clamp(y, 0, max);
      vel = (y - prevY) / Math.max(dtSec, 1e-6);
    },
    tweenTo(t: number, ms: number): void {
      tween = { from: target, to: clamp(t, 0, max), elapsedMs: 0, durMs: ms };
      inertia = 0; // a programmatic move drops leftover flick momentum
    },
    setMax(n: number): void {
      max = Math.max(0, n);
      target = clamp(target, 0, max);
      head = clamp(head, 0, max);
      y = clamp(y, 0, max);
      if (tween) tween.to = clamp(tween.to, 0, max);
    },
    lock(): void {
      locked = true;
    },
    unlock(): void {
      locked = false;
    },
    isLocked(): boolean {
      return locked;
    },
  };
}
