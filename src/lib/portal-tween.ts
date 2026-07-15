// Portal choreography — a pure, deterministic state machine (no DOM, no three). Three tracks run
// in parallel on open: a 700ms camera fly-in (easeOutCubic), a 1500ms wipe (cubic-bezier), and a
// 1500ms backdrop dolly (easeInOutCubic). Close is an 800ms reverse of ALL tracks FROM THEIR
// CURRENT VALUE, so a mid-flight close never jumps. Easing is elapsed-based (each track = ease of
// accumulated-ms / duration), so the trace is invariant to dt subdivision and step order — the
// same property virtual-scroll relies on for framerate independence.

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Track durations (ms). Close is a single shared reverse duration for all three tracks.
export const CAM_MS = 700;
export const WIPE_MS = 1500;
export const DOLLY_MS = 1500;
export const CLOSE_MS = 800;
/** Wheel exit gesture: |px/s| at or above this closes the portal (spec §3 / §6 velocity exit). */
export const EXIT_THRESHOLD = 1200;

export type PortalPhase = "closed" | "opening" | "open" | "closing";

export interface PortalTracks {
  readonly phase: PortalPhase;
  /** camera fly-in 0→1 (easeOutCubic, 700ms) */
  readonly camT: number;
  /** wipe 0→1 (cubic-bezier(.29,.05,.06,.92), 1500ms) */
  readonly wipeT: number;
  /** backdrop dolly 0→1 (easeInOutCubic, 1500ms) */
  readonly dollyT: number;
}

export interface PortalMachine {
  readonly phase: PortalPhase;
  readonly camT: number;
  readonly wipeT: number;
  readonly dollyT: number;
  /** Begin opening. Idempotent while opening/open. `fastMs` overrides ALL track durations (deep-link fast-path). */
  open(fastMs?: number): void;
  /** Begin the 800ms reverse from the current track values. Idempotent while closing/closed. */
  close(): void;
  /** Advance by `dtSec` seconds; returns the current tracks. */
  step(dtSec: number): PortalTracks;
  /** True when a scroll flick magnitude (px/s) is at or over the exit threshold. */
  exitGesture(accumPxPerSec: number): boolean;
}

/**
 * Cubic-bezier y(x) solver for CSS-style control points P1=(x1,y1), P2=(x2,y2) with P0=(0,0),
 * P3=(1,1). Solves x(t)=x by Newton–Raphson (8 iters), falling back to bisection when the
 * derivative is degenerate or Newton leaves [0,1]. Returns a reusable y(x) closure. Endpoints are
 * pinned exactly; x outside [0,1] clamps to 0/1.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  // Polynomial coefficients for a coordinate with p0=0, p3=1: B(t) = ((a·t + b)·t + c)·t.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x; // a good first guess for near-diagonal curves
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      const d = sampleDX(t);
      if (Math.abs(err) < 1e-7) return t;
      if (Math.abs(d) < 1e-7) break; // derivative too flat — hand off to bisection
      t -= err / d;
    }
    // Bisection fallback, guaranteed to bracket the root on the monotone-x segment.
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 32; i++) {
      const xv = sampleX(t);
      if (Math.abs(xv - x) < 1e-7) return t;
      if (xv < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveT(x));
  };
}

const wipeBezier = cubicBezier(0.29, 0.05, 0.06, 0.92);

export function createPortalMachine(): PortalMachine {
  let phase: PortalPhase = "closed";
  let camT = 0;
  let wipeT = 0;
  let dollyT = 0;
  // Per-open durations (fast-path overrides all three).
  let camDur = CAM_MS;
  let wipeDur = WIPE_MS;
  let dollyDur = DOLLY_MS;
  let openElapsed = 0; // ms since open()
  let closeElapsed = 0; // ms since close()
  // Snapshot of the tracks at the moment close() was called — the reverse scales from these so a
  // mid-flight close continues from exactly where it was (no jump).
  let camStart = 0;
  let wipeStart = 0;
  let dollyStart = 0;

  const tracks = (): PortalTracks => ({ phase, camT, wipeT, dollyT });

  return {
    get phase() {
      return phase;
    },
    get camT() {
      return camT;
    },
    get wipeT() {
      return wipeT;
    },
    get dollyT() {
      return dollyT;
    },
    open(fastMs?: number): void {
      if (phase === "opening" || phase === "open") return; // idempotent — don't restart the wipe
      phase = "opening";
      openElapsed = 0;
      camDur = fastMs ?? CAM_MS;
      wipeDur = fastMs ?? WIPE_MS;
      dollyDur = fastMs ?? DOLLY_MS;
      camT = 0;
      wipeT = 0;
      dollyT = 0;
    },
    close(): void {
      if (phase === "closed" || phase === "closing") return; // idempotent
      camStart = camT;
      wipeStart = wipeT;
      dollyStart = dollyT;
      phase = "closing";
      closeElapsed = 0;
    },
    step(dtSec: number): PortalTracks {
      const dtMs = Math.max(0, dtSec) * 1000;
      if (phase === "opening") {
        openElapsed += dtMs;
        camT = easeOutCubic(clamp01(openElapsed / camDur));
        wipeT = wipeBezier(clamp01(openElapsed / wipeDur));
        dollyT = easeInOutCubic(clamp01(openElapsed / dollyDur));
        if (openElapsed >= Math.max(camDur, wipeDur, dollyDur)) {
          phase = "open";
          camT = 1;
          wipeT = 1;
          dollyT = 1;
        }
      } else if (phase === "closing") {
        closeElapsed += dtMs;
        const k = 1 - easeOutCubic(clamp01(closeElapsed / CLOSE_MS)); // 1 → 0
        camT = camStart * k;
        wipeT = wipeStart * k;
        dollyT = dollyStart * k;
        if (closeElapsed >= CLOSE_MS) {
          phase = "closed";
          camT = 0;
          wipeT = 0;
          dollyT = 0;
        }
      }
      return tracks();
    },
    exitGesture(accumPxPerSec: number): boolean {
      return Math.abs(accumPxPerSec) >= EXIT_THRESHOLD;
    },
  };
}
