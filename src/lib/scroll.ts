import type Lenis from "lenis";

/** Single number written by the scroll listener; everything else derives in useFrame. */
export const scrollState = { y: 0 };

/** Layout metrics — measured at mount + resize/ResizeObserver ONLY. Floored at 1 (no NaN). */
export const scrollMetrics = { maxScroll: 1, heroEnd: 1 };

/** Per-frame derived signals, written once per frame by Hero's useFrame, read by gl siblings. */
export const scrollSignals = { p: 0, heroP: 0, energy: 0 };

/** Bridge: SmoothScroll (DOM side) owns the instance; RafBridge (GL side) feeds raf. */
export const lenisRef: { current: Lenis | null } = { current: null };

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);
export const smoothstep01 = (t: number): number => t * t * (3 - 2 * t);

/** Asymmetric envelope: fast attack (~80ms), exponential decay tau=0.45s. Never overshoots. */
export function stepEnergy(current: number, target: number, dt: number): number {
  const k = target > current ? Math.min(1, dt * 12) : 1 - Math.exp(-dt / 0.45);
  return current + (target - current) * k;
}

export function measureScrollMetrics(): void {
  const doc = document.scrollingElement;
  scrollMetrics.maxScroll = Math.max(1, (doc?.scrollHeight ?? 0) - window.innerHeight);
  const hero = document.getElementById("hero");
  scrollMetrics.heroEnd = Math.max(1, hero ? hero.offsetTop + hero.offsetHeight : 0);
}

// --- scene-live store: set from inside the Canvas, consumed by SmoothScroll ---
let sceneLive = false;
const liveSubs = new Set<() => void>();
export function getSceneLive(): boolean {
  return sceneLive;
}
export function setSceneLive(v: boolean): void {
  if (v === sceneLive) return;
  sceneLive = v;
  for (const cb of liveSubs) cb();
}
export function subscribeSceneLive(cb: () => void): () => void {
  liveSubs.add(cb);
  return () => liveSubs.delete(cb);
}
