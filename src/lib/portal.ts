import { clamp01, smoothstep01 } from "./scroll";

/** Shared ring knobs — CasePortals places cards on this radius with this z-tilt. */
export const PORTAL_RING = { radius: 1.15, tiltZ: -0.08 } as const;

/** Scatter bounds per axis for shard offsets: x tangent-biased, y/z tighter. */
const SCATTER = { x: 1.5, y: 0.6, z: 0.4 } as const;

/** Standard mulberry32 PRNG: deterministic [0,1) stream from an integer seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pose of card i on the portal ring at scroll progress workP ∈ [0,1].
 * The ring turns (count - 1) slots across the range: card 0 faces the camera at
 * workP=0, card count-1 at workP=1. Pure function of inputs — scrub-safe.
 * - yaw: (i - slot) * 2π/count, continuous in workP.
 * - active: card nearest the camera (round(slot) === i).
 * - t: fractional slot progress — 0 settled on a card, →1 approaching the next.
 *   t saw-wraps 1→0 at each settled join; explodeEnvelope(t) is 0 at both ends,
 *   so the composed shatter amount stays continuous through the wrap.
 */
export function ringPose(
  workP: number,
  count: number,
  i: number,
): { yaw: number; active: boolean; t: number } {
  if (count <= 1) return { yaw: 0, active: true, t: 0 };
  const slot = clamp01(workP) * (count - 1);
  const yaw = (i - slot) * ((Math.PI * 2) / count);
  return { yaw, active: Math.round(slot) === i, t: slot - Math.floor(slot) };
}

/**
 * Per-shard scatter attributes for a cols×rows shard grid: offsets is a vec3
 * scatter direction per shard (x ∈ ±SCATTER.x tangent-biased, y ∈ ±SCATTER.y,
 * z ∈ ±SCATTER.z), rands a phase ∈ [0,1). Deterministic via mulberry32(seed) —
 * same args always yield identical arrays (no Math.random anywhere).
 * Consumers (CasePortals) MUST keep their shard grid dims in sync with the
 * cols/rows passed here, or attribute counts drift from the geometry.
 */
export function shardScatterAttrs(
  cols: number,
  rows: number,
  seed: number,
): { offsets: Float32Array; rands: Float32Array } {
  const n = cols * rows;
  const offsets = new Float32Array(n * 3);
  const rands = new Float32Array(n);
  const rng = mulberry32(seed);
  for (let s = 0; s < n; s++) {
    offsets[s * 3] = (rng() * 2 - 1) * SCATTER.x;
    offsets[s * 3 + 1] = (rng() * 2 - 1) * SCATTER.y;
    offsets[s * 3 + 2] = (rng() * 2 - 1) * SCATTER.z;
    rands[s] = rng();
  }
  return { offsets, rands };
}

/**
 * Shatter envelope over a transition t: 0 at t≤0 and t≥1, smoothstepping up to
 * 1 at the t=0.5 midpoint (smoothstep of a tent) — continuous and symmetric,
 * so feeding it ringPose().t hides the saw-wrap at settled joins.
 */
export function explodeEnvelope(t: number): number {
  return smoothstep01(clamp01(1 - Math.abs(2 * t - 1)));
}
