// Key-point system — pure, no DOM, no three. Section rects (offsetTop/offsetHeight)
// measured in scroll.ts become normalized anchors on p, and blendAt()/sectionAt()
// drive the helix morph, camera waypoints, palette scrub and burst triggers off them.
// Kept scroll-free (its own clamp/smoothstep) so scroll.ts can import it without a cycle.

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** A measured DOM section: its document-space top and height. */
export interface SectionRect {
  readonly id: string;
  readonly offsetTop: number;
  readonly offsetHeight: number;
}

/** A section's place on the normalized scroll axis p ∈ [0,1]. */
export interface Anchor {
  /** section id (hero/services/work/process/about/contact) */
  readonly id: string;
  /** keyframe position: p where the section top reaches the viewport top (offsetTop / maxScroll) */
  readonly p: number;
  /** p where the section first enters the viewport (bottom edge) */
  readonly pStart: number;
  /** p where the section top passes the viewport top */
  readonly pEnd: number;
}

export interface Keypoints {
  readonly anchors: readonly Anchor[];
}

/** Adjacent-anchor blend: eased t in [0,1] from `from` to `to` (section ids, table-keyable). */
export interface Blend {
  readonly from: string;
  readonly to: string;
  readonly t: number;
}

/**
 * Build anchors from measured section rects. maxScroll is floored at 1 (the scroll
 * store guarantees this too) so a zero-height document never divides by zero. Missing
 * sections are simply absent from `sections` → absent from anchors (ids stay stable,
 * so downstream tables key by id, never by index).
 */
export function measureKeypoints(sections: readonly SectionRect[], maxScroll: number, vh: number): Keypoints {
  const m = Math.max(1, maxScroll);
  const anchors: Anchor[] = sections.map((s) => ({
    id: s.id,
    p: clamp01(s.offsetTop / m),
    pStart: clamp01((s.offsetTop - vh) / m),
    pEnd: clamp01((s.offsetTop + s.offsetHeight) / m),
  }));
  return { anchors };
}

/**
 * Which adjacent section pair p sits between, and the eased fraction across it.
 * Before the first anchor holds section 0 (t=0); past the last holds the last (t=0);
 * at an exact anchor t=0 on the segment starting there — so morphAt is continuous
 * across every join (t hits exactly 0/1 at anchors, from/to shift by one, value matches).
 */
export function blendAt(kp: Keypoints, p: number): Blend {
  const a = kp.anchors;
  if (a.length === 0) return { from: "", to: "", t: 0 };
  if (a.length === 1 || p <= a[0].p) return { from: a[0].id, to: a[0].id, t: 0 };
  const last = a[a.length - 1];
  if (p >= last.p) return { from: last.id, to: last.id, t: 0 };
  // Largest i (≤ last-1) with a[i].p <= p; a[i+1].p > p follows from p < last.p.
  let i = 0;
  for (let k = 0; k < a.length - 1; k++) if (a[k].p <= p) i = k;
  const lo = a[i];
  const hi = a[i + 1];
  const denom = hi.p - lo.p;
  const raw = denom > 1e-9 ? (p - lo.p) / denom : 1; // coincident anchors → snap to next
  return { from: lo.id, to: hi.id, t: smoothstep(clamp01(raw)) };
}

/** The current section: the last one whose anchor p has been reached (boundary at anchor p). */
export function sectionAt(kp: Keypoints, p: number): string {
  const a = kp.anchors;
  if (a.length === 0) return "";
  let i = 0;
  for (let k = 0; k < a.length; k++) if (a[k].p <= p) i = k;
  return a[i].id;
}
