import { type Keypoints, measureKeypoints, type SectionRect } from "./keypoints";

/** Single number written by the scroll writer (native scroll OR the virtual pipeline). */
export const scrollState = { y: 0 };

/** Layout metrics — measured at mount + resize/ResizeObserver ONLY. Floored at 1 (no NaN). */
export const scrollMetrics = { maxScroll: 1, heroEnd: 1, workStart: 1, workSpan: 1 };

/**
 * Per-frame derived signals, written once per frame by Hero's useFrame, read by gl siblings.
 * vel/velN/velSm are the velocity bus (px/s, normalized ±1 at 2000px/s, long-tail smoothed) —
 * single-writer discipline: extended in Hero alongside `energy`, never written elsewhere.
 */
export const scrollSignals = { p: 0, heroP: 0, workP: 0, energy: 0, vel: 0, velN: 0, velSm: 0 };

/** Active scroll writer: native scroll (false) or the virtual pipeline (true). */
export const scrollMode = { virtual: false };

/**
 * Section anchors on p — rebuilt whole by measureScrollMetrics (mount + resize/RO), read
 * per frame by the helix morph, camera rig and (later) palette/burst triggers. Seeded empty;
 * blendAt on empty degrades to a rest-holding blend, so consumers stay NaN-free before mount.
 */
export const keypointsStore: { current: Keypoints } = { current: measureKeypoints([], 1, 1) };

/** Canonical section order for keypoint measurement — MUST match the DOM section ids. */
const SECTION_IDS = ["hero", "services", "work", "process", "about", "contact"] as const;

/**
 * Bridge: VirtualScroll (DOM side) registers a per-tick frame fn; RafBridge (GL side) feeds it
 * the addEffect timestamp. `frame` wraps the pure pipeline (dt from timestamps + DOM transform).
 */
export const pipelineRef: { current: { frame(tMs: number): void } | null } = { current: null };

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);
export const smoothstep01 = (t: number): number => t * t * (3 - 2 * t);

/** Asymmetric envelope: fast attack (~80ms), exponential decay tau=0.45s. Never overshoots. */
export function stepEnergy(current: number, target: number, dt: number): number {
  const k = target > current ? Math.min(1, dt * 12) : 1 - Math.exp(-dt / 0.45);
  return current + (target - current) * k;
}

export function measureScrollMetrics(): void {
  // Virtual mode: the body doesn't scroll, so max travel is the DOCUMENT-SPACE bottom of
  // the transformed content minus the viewport — offsetTop + offsetHeight, because #vs-root
  // sits below the sticky Nav and its height alone under-measures the native range by Nav's
  // height. Anchors tween in the same offsetTop space, so max must live there too.
  // Native mode: the document scroll range. offsetTop-based hero/work metrics below are
  // transform-independent (transforms don't move offsetTop).
  if (scrollMode.virtual) {
    const root = document.getElementById("vs-root");
    scrollMetrics.maxScroll = root
      ? Math.max(1, root.offsetTop + root.offsetHeight - window.innerHeight)
      : 1;
  } else {
    const doc = document.scrollingElement;
    scrollMetrics.maxScroll = Math.max(1, (doc?.scrollHeight ?? 0) - window.innerHeight);
  }
  const hero = document.getElementById("hero");
  scrollMetrics.heroEnd = Math.max(1, hero ? hero.offsetTop + hero.offsetHeight : 0);
  // #work scroll window: start 0.6vh before the section, span padded by 0.2vh.
  // Reset to 1 on every measure so a removed element never leaves stale values.
  scrollMetrics.workStart = 1;
  scrollMetrics.workSpan = 1;
  const work = document.getElementById("work");
  if (work) {
    scrollMetrics.workStart = Math.max(1, work.offsetTop - 0.6 * window.innerHeight);
    scrollMetrics.workSpan = Math.max(1, work.offsetHeight + 0.2 * window.innerHeight);
  }
  // Section anchors — rebuilt WHOLE from the six section rects each measure (reset-first
  // discipline: a removed section simply drops out, never leaves stale anchors). offsetTop
  // is transform-independent, so this is correct in both native and virtual mode.
  const rects: SectionRect[] = [];
  for (const id of SECTION_IDS) {
    const el = document.getElementById(id);
    if (el) rects.push({ id, offsetTop: el.offsetTop, offsetHeight: el.offsetHeight });
  }
  keypointsStore.current = measureKeypoints(rects, scrollMetrics.maxScroll, window.innerHeight);
}

// --- scene-live store: set from inside the Canvas, consumed by VirtualScroll ---
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
