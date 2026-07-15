// Analytic particle pool — pure, no three (D4: stateless-analytic hybrid, NO position/velocity
// FBO sim). Every particle's motion is a closed-form function of its mulberry32 seed + uTime +
// a handful of uniforms, so the field is scrub-safe, deterministic and divergence-free. This
// module owns the burst ring-buffer (4 slots, oldest-evict, 2.5s expiry) and the ballistic burst
// closed-form; Particles.tsx ports the SAME math to GLSL 1:1 (constants shared, so the port is
// verifiable against these tests). Kept three-free so vitest exercises the physics directly.

import type { Tier } from "./quality";

export type Vec3 = readonly [number, number, number];

const TWO_PI = Math.PI * 2;

// --- pool sizing -----------------------------------------------------------------------------
/** Instanced pool size per tier (D4: 16k high / 8k med / 2k low). One InstancedMesh, this many quads. */
export const POOL_SIZE: Record<Tier, number> = { high: 16384, med: 8192, low: 2048 };

// --- burst ring ------------------------------------------------------------------------------
/** Number of concurrent burst slots (D4 ring buffer). */
export const BURST_SLOTS = 4;
/** A burst is inert this many seconds after it fires (particles have rejoined the ambient field). */
export const BURST_EXPIRY = 2.5;

// Ballistic constants — the burst is analytic ballistic + linear drag + gravity, solved in closed
// form from age τ. Shared with the GLSL port (Particles.tsx) so the shader is 1:1 with these tests.
/** Linear-drag coefficient k (1/s): velocity e-folds at this rate, bounding the outward spread. */
export const BURST_DRAG = 2.2;
/** Downward gravity g (units/s²): gives each burst an apex then a fall within its lifetime. */
export const BURST_GRAVITY = 3.5;
/** Base launch speed (units/s) at strength 1, before the per-particle seed spread. */
export const BURST_SPEED = 2.4;

/**
 * Launch direction for a burst particle from two seed scalars in [0,1). Azimuth spans the full
 * circle; elevation is biased UP (≈10°..80°) so a burst reads as an upward confetti spray, never
 * a flat disc. Always a unit vector with a positive y — pure and deterministic per seed.
 */
export function seedToBurstDir(a: number, b: number): Vec3 {
  const az = a * TWO_PI;
  const el = 0.18 + 1.22 * b; // radians, ≈10.3°..80.2° — always > 0 (upward)
  const ce = Math.cos(el);
  return [Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce];
}

/**
 * Closed-form ballistic offset from the burst origin at age τ (seconds), for a particle launched
 * along unit `dir` at `speed`. Model: dv/dt = a − k·v with a = (0, −g, 0), k = BURST_DRAG. Per
 * component x(τ) = v_ss·τ + (v0 − v_ss)/k·(1 − e^{−kτ}); horizontals have v_ss=0 (bounded at
 * speed/k), the vertical carries the gravity terminal term. τ=0 ⇒ exactly the origin.
 */
export function burstOffset(dir: Vec3, speed: number, tau: number): Vec3 {
  const k = BURST_DRAG;
  const e = Math.exp(-k * tau);
  const imp = (1 - e) / k; // ∫e^{−kτ} shape → the drag-bounded impulse displacement, → 1/k as τ→∞
  const vss = -BURST_GRAVITY / k; // vertical steady-state (terminal) velocity
  return [
    dir[0] * speed * imp,
    dir[1] * speed * imp + vss * (tau - imp), // impulse rise + gravity closed form
    dir[2] * speed * imp,
  ];
}

/** Per-particle launch speed from strength + a seed scalar (0.6×..1.0× spread). Shared with GLSL. */
export function burstSpeedFor(strength: number, seedW: number): number {
  return BURST_SPEED * strength * (0.6 + 0.4 * seedW);
}

interface Slot {
  x: number;
  y: number;
  z: number;
  t0: number;
  strength: number;
}

/** GLSL-ready burst uniform payload: `slots` packs vec4(x,y,z,t0)×4; `strengths` is float[4] (0 = inert). */
export interface BurstUniforms {
  /** flat vec4[4] — xyz origin + t0 per slot; upload straight to `uniform vec4 uBursts[4]` */
  readonly slots: Float32Array;
  /** float[4] — live strength per slot, 0 when the slot is empty/expired (gates the GLSL term) */
  readonly strengths: Float32Array;
}

export interface BurstManager {
  /** Fire a burst at `pos` with `strength`, stamped at `tNow` (same clock the shader feeds uTime). */
  emit(pos: Vec3, strength: number, tNow: number): void;
  /** Rebuild the GLSL uniform payload for time `tNow` (expired/empty slots report strength 0). */
  uniformsAt(tNow: number): BurstUniforms;
  /** Count of live (unexpired, positive-strength) slots at `tNow` — for tests/diagnostics. */
  activeCount(tNow: number): number;
}

/**
 * Ring of BURST_SLOTS burst slots. `emit` overwrites the slot with the smallest t0 — which is
 * always an empty/expired slot when one exists (every expired slot has t0 < tNow−EXPIRY ≤ every
 * live slot's t0), and otherwise the genuinely oldest live burst (oldest-evict). Output buffers
 * are owned + reused, so `uniformsAt` allocates nothing per frame.
 */
export function createBurstManager(): BurstManager {
  const slots: Slot[] = Array.from({ length: BURST_SLOTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    t0: -Infinity, // never used → chosen first for eviction
    strength: 0,
  }));
  const outSlots = new Float32Array(BURST_SLOTS * 4);
  const outStr = new Float32Array(BURST_SLOTS);

  const isLive = (s: Slot, tNow: number): boolean => {
    const age = tNow - s.t0;
    return s.strength > 0 && age >= 0 && age <= BURST_EXPIRY;
  };

  return {
    emit(pos, strength, tNow) {
      let target = 0;
      let oldest = Infinity;
      for (let i = 0; i < BURST_SLOTS; i++) {
        if (slots[i].t0 < oldest) {
          oldest = slots[i].t0;
          target = i;
        }
      }
      const s = slots[target];
      s.x = pos[0];
      s.y = pos[1];
      s.z = pos[2];
      s.t0 = tNow;
      s.strength = strength;
    },
    uniformsAt(tNow) {
      for (let i = 0; i < BURST_SLOTS; i++) {
        const s = slots[i];
        outSlots[i * 4] = s.x;
        outSlots[i * 4 + 1] = s.y;
        outSlots[i * 4 + 2] = s.z;
        outSlots[i * 4 + 3] = s.t0;
        outStr[i] = isLive(s, tNow) ? s.strength : 0;
      }
      return { slots: outSlots, strengths: outStr };
    },
    activeCount(tNow) {
      let n = 0;
      for (let i = 0; i < BURST_SLOTS; i++) if (isLive(slots[i], tNow)) n++;
      return n;
    },
  };
}

// --- seed attribute layout -------------------------------------------------------------------
import { mulberry32 } from "./prng";

/** Fixed base seed for the particle stream — deterministic field, no Math.random (repo rule). */
export const PARTICLE_SEED = 0x9e3779b9;

/**
 * Build the flat `aSeed` vec4 attribute for `count` instances: four mulberry32 draws per particle
 * (azimuth/elevation/radius+palette/phase+speed). Deterministic from PARTICLE_SEED so the field is
 * identical across reloads and scrubs.
 */
export function buildSeeds(count: number, seed: number = PARTICLE_SEED): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) out[i] = rnd();
  return out;
}
