// Deterministic PRNG. Sole survivor of the retired portal.ts (S4 CasePortals peel): its
// ring/scatter math went with the component, but mulberry32 stays — the particle seeds
// (P5) need a stable, Math.random-free stream keyed by content order.

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
