// Palette / lighting scrub table — pure, no DOM, no three. Per-section keyframes for the
// "same geometry, different light" read (spec §7): background gradient (RippleBackground),
// axis material tint/emissive (HelixRibbon), and post tint/contrast (PostChain). Lerped by
// blendAt(p) exactly like helix-morph's morphAt — one keyframe set eased between two sections.
//
// This is the SINGLE source of scene lighting. It is INDEPENDENT of the axis A/B variant
// (debugChoice("axis")): the morph|comp control changes the ribbon SHAPE, never the light —
// so paletteAt takes only a blend, never a variant. helix-morph carries its own tint/emissive
// fields but those stay reserved/unused; the palette owns the light on both variants.

import type { Blend } from "./keypoints";

/** rgb triple in [0,1] linear-ish authoring space (multipliers / gradient stops). */
export type RGB = readonly [number, number, number];

export interface PaletteKeyframe {
  /** RippleBackground gradient — top stop (vUv.y = 1) */
  readonly bgTop: RGB;
  /** RippleBackground gradient — bottom stop (vUv.y = 0) */
  readonly bgBottom: RGB;
  /** multiplicative colour tint for the axis material AND the post composite ([1,1,1] = neutral) */
  readonly tint: RGB;
  /** post contrast around 0.5 mid-grey (1 = neutral) */
  readonly contrast: number;
  /** axis emissive lift (0 = none) */
  readonly emissive: number;
}

/** Canonical section order — keep in sync with the DOM section ids + helix-morph SECTION_ORDER. */
export const SECTION_ORDER = ["hero", "services", "work", "process", "about", "contact"] as const;
export type SectionId = (typeof SECTION_ORDER)[number];

// The site accent (#4da6e8 ≈ [0.302,0.651,0.910]) is today's RippleBackground colour. Hero uses
// it for BOTH gradient stops, so hero (p=0) reproduces today's flat-accent background EXACTLY —
// an equal-endpoint gradient is a constant, byte-for-byte the pre-P6 look.
const ACCENT: RGB = [0.302, 0.651, 0.91];

/** Rest = hero: flat accent background, neutral tint/contrast, no emissive lift (today's look). */
export const PALETTE_REST: PaletteKeyframe = {
  bgTop: ACCENT,
  bgBottom: ACCENT,
  tint: [1, 1, 1],
  contrast: 1,
  emissive: 0,
};

// Per-section lighting rows (starting tuning — subject to the P6 §6.4 pass + the verifier's
// visual review, NOT dogma). The intent tracks the helix-morph choreography: services braids
// tighter + cools; work OPENS with a cyan emissive lift (mirrors helix-morph work emissive 0.15);
// process/about relax back toward neutral; contact rises as a deeper, higher-contrast tower.
const PALETTE_ROWS: Record<SectionId, PaletteKeyframe> = {
  hero: PALETTE_REST,
  services: {
    bgTop: [0.24, 0.55, 0.85],
    bgBottom: [0.3, 0.65, 0.91],
    tint: [0.97, 0.99, 1.03],
    contrast: 1.03,
    emissive: 0.03,
  },
  work: {
    bgTop: [0.2, 0.6, 0.86],
    bgBottom: [0.36, 0.8, 1.0],
    tint: [0.86, 0.97, 1.05],
    contrast: 1.06,
    emissive: 0.16,
  },
  process: {
    bgTop: [0.22, 0.5, 0.78],
    bgBottom: [0.28, 0.6, 0.88],
    tint: [0.98, 1.0, 1.02],
    contrast: 1.02,
    emissive: 0.02,
  },
  about: {
    bgTop: [0.3, 0.58, 0.8],
    bgBottom: [0.38, 0.66, 0.86],
    tint: [1.02, 1.0, 0.98],
    contrast: 1.0,
    emissive: 0.0,
  },
  contact: {
    bgTop: [0.16, 0.42, 0.72],
    bgBottom: [0.26, 0.58, 0.9],
    tint: [0.9, 0.96, 1.05],
    contrast: 1.08,
    emissive: 0.1,
  },
};

/** Test-only view of the raw per-section rows (exactness assertions at anchors). */
export const PALETTE_ROWS_FOR_TEST: Readonly<Record<SectionId, PaletteKeyframe>> = PALETTE_ROWS;

const lp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lpRGB = (a: RGB, b: RGB, t: number): RGB => [lp(a[0], b[0], t), lp(a[1], b[1], t), lp(a[2], b[2], t)];

/**
 * Lerp a whole palette keyframe from PALETTE_ROWS[blend.from] to [blend.to] by blend.t. Unknown
 * ids (empty blend before mount) fall back to rest, so consumers stay defined pre-measure. Pure
 * function of the blend only — no axis variant, no global state (the "comp-variant independence").
 */
export function paletteAt(blend: Blend): PaletteKeyframe {
  const a = PALETTE_ROWS[blend.from as SectionId] ?? PALETTE_REST;
  const b = PALETTE_ROWS[blend.to as SectionId] ?? a;
  const t = blend.t;
  return {
    bgTop: lpRGB(a.bgTop, b.bgTop, t),
    bgBottom: lpRGB(a.bgBottom, b.bgBottom, t),
    tint: lpRGB(a.tint, b.tint, t),
    contrast: lp(a.contrast, b.contrast, t),
    emissive: lp(a.emissive, b.emissive, t),
  };
}
