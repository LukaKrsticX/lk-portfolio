import { clamp01 } from "./scroll";

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
 * The dissolve phase lives in cardRel, not here — the directional peel is
 * per-card and signed, while yaw/active are ring-global.
 */
export function ringPose(
  workP: number,
  count: number,
  i: number,
): { yaw: number; active: boolean } {
  if (count <= 1) return { yaw: 0, active: true };
  const slot = clamp01(workP) * (count - 1);
  const yaw = (i - slot) * ((Math.PI * 2) / count);
  return { yaw, active: Math.round(slot) === i };
}

/**
 * Signed per-card dissolve phase for the S4 directional peel:
 * rel = clamp(clamp01(workP) * (count - 1) - i, -1, 1).
 * - 0: card i is settled front-and-center.
 * - (0, 1]: departing — the peel front has consumed rel of the card; at 1 it
 *   is fully dust (and faded out — the outgoing card never reassembles).
 * - [-1, 0): arriving — 1 - |rel| of the card has condensed from dust,
 *   far edge first.
 * Only the cards adjacent to the active slot sit strictly inside (-1, 1);
 * everyone else saturates at ±1 (fully dust). Monotonic non-decreasing in
 * workP and a pure function of its inputs — scrubbing back rewinds the peel
 * exactly. count <= 1 pins to 0 (a lone card stays settled).
 */
export function cardRel(workP: number, count: number, i: number): number {
  if (count <= 1) return 0;
  const rel = clamp01(workP) * (count - 1) - i;
  return rel < -1 ? -1 : rel > 1 ? 1 : rel;
}

/**
 * Per-shard scatter attributes for a cols×rows shard grid: offsets is a vec3
 * per shard (x ∈ ±SCATTER.x tangent-biased, y ∈ ±SCATTER.y, z ∈ ±SCATTER.z),
 * rands a phase ∈ [0,1). In the peel shader aOffset.y/.z jitter the flight
 * path into the dust spine (aOffset.x is currently unused) and aRand jitters
 * the spine target + tumble phase. Deterministic via mulberry32(seed) — same
 * args always yield identical arrays (no Math.random anywhere).
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
