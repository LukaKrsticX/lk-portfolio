// Helix key-point morph table — pure, no three. Per-section keyframes for the
// parametric axis; morphAt() lerps a whole keyframe set between two sections. The
// GLSL shape uniforms (radius/turns/pitch/width) live here as the single source of
// truth; the shader in HelixRibbon consumes them. `comp` pins the shape to rest so
// only the composition (drift/tilt/scale) moves — the A/B control for the morph.

/** Axial length of the strip — baked into the geometry AND the shader (kept in sync here). */
export const HELIX_LENGTH = 7;
/** Rest tilt of the drift group (today's baked value; the drift-group JSX rest pose). */
export const HELIX_TILT_REST = -0.42;

export interface HelixKeyframe {
  /** orbit radius of the strand around the axis (world units) */
  readonly radius: number;
  /** twist count over the strip length */
  readonly turns: number;
  /** axial stretch multiplier (1 = today's length) */
  readonly pitch: number;
  /** radial thickness of the strip (world units) */
  readonly width: number;
  /** drift-group rotation.z (axis tilt) */
  readonly tiltZ: number;
  /** drift-group position [x,y,z] */
  readonly drift: readonly [number, number, number];
  /** drift-group uniform scale */
  readonly scale: number;
  /** emissive lift — reserved for the P6 palette scrub (carried through the lerp, not applied in P2) */
  readonly emissive: number;
  /** material tint [r,g,b] — reserved for the P6 palette scrub (carried, not applied in P2) */
  readonly tint: readonly [number, number, number];
}

export type Variant = "morph" | "comp";
export type HelixTable = Readonly<Record<string, HelixKeyframe>>;

/** The staged A/B choices for debugChoice("axis", AXIS_VARIANTS). */
export const AXIS_VARIANTS = ["morph", "comp"] as const;

/** Canonical section order — table row identity; keep in sync with the DOM section ids. */
export const SECTION_ORDER = ["hero", "services", "work", "process", "about", "contact"] as const;
export type SectionId = (typeof SECTION_ORDER)[number];

/** Rest = today's baked helix (radius 0.25 / turns 2.25 / width 0.2 / tilt −0.42 / drift 1.45,0.1,−0.7). */
export const HELIX_REST: HelixKeyframe = {
  radius: 0.25,
  turns: 2.25,
  pitch: 1,
  width: 0.2,
  tiltZ: HELIX_TILT_REST,
  drift: [1.45, 0.1, -0.7],
  scale: 1,
  emissive: 0,
  tint: [1, 1, 1],
};

// Full parametric morph rows (variant A). D3 starting tuning — tunable in P6, not dogma.
// hero = rest (p=0 continuity). After hero the axis drifts to center; work OPENS into the
// visible rail (radius grows, turns drop, pitch stretches); about/process relax off-center;
// contact rises to a near-vertical tower (tiltZ −1.25, amplified from the retired helixTiltAt).
const MORPH_ROWS: Record<SectionId, HelixKeyframe> = {
  hero: HELIX_REST,
  services: { radius: 0.19, turns: 3, pitch: 1, width: 0.2, tiltZ: -0.42, drift: [0.2, 0.1, -0.7], scale: 1, emissive: 0, tint: [1, 1, 1] },
  work: { radius: 0.9, turns: 1.2, pitch: 1.35, width: 0.25, tiltZ: -0.3, drift: [0, 0, -1], scale: 1.05, emissive: 0.15, tint: [0.8, 0.95, 1] },
  process: { radius: 0.35, turns: 2, pitch: 1.1, width: 0.2, tiltZ: -0.5, drift: [-0.4, 0.1, -0.85], scale: 1, emissive: 0, tint: [1, 1, 1] },
  about: { radius: 0.3, turns: 2, pitch: 1, width: 0.2, tiltZ: -0.55, drift: [0.45, 0.2, -0.9], scale: 0.95, emissive: 0, tint: [1, 1, 1] },
  contact: { radius: 0.25, turns: 2.5, pitch: 1, width: 0.2, tiltZ: -1.25, drift: [0.2, 0, -0.7], scale: 1, emissive: 0.1, tint: [1, 1, 1] },
};

/**
 * Table for a variant. `morph` is MORPH_ROWS verbatim. `comp` (the A/B control) pins the
 * shape fields (radius/turns/pitch/width) to rest so the ribbon never morphs — only the
 * compositional keyframes (tiltZ/drift/scale/emissive/tint) run, a cheap subset of A.
 */
export function buildHelixTable(variant: Variant): HelixTable {
  if (variant === "morph") return MORPH_ROWS;
  const comp: Record<string, HelixKeyframe> = {};
  for (const id of SECTION_ORDER) {
    comp[id] = {
      ...MORPH_ROWS[id],
      radius: HELIX_REST.radius,
      turns: HELIX_REST.turns,
      pitch: HELIX_REST.pitch,
      width: HELIX_REST.width,
    };
  }
  return comp;
}

/** Lerp a whole keyframe from table[blend.from] to table[blend.to] by blend.t. Unknown id → rest. */
export function morphAt(table: HelixTable, blend: { from: string; to: string; t: number }): HelixKeyframe {
  const a = table[blend.from] ?? HELIX_REST;
  const b = table[blend.to] ?? a;
  const t = blend.t;
  const lp = (x: number, y: number): number => x + (y - x) * t;
  return {
    radius: lp(a.radius, b.radius),
    turns: lp(a.turns, b.turns),
    pitch: lp(a.pitch, b.pitch),
    width: lp(a.width, b.width),
    tiltZ: lp(a.tiltZ, b.tiltZ),
    drift: [lp(a.drift[0], b.drift[0]), lp(a.drift[1], b.drift[1]), lp(a.drift[2], b.drift[2])],
    scale: lp(a.scale, b.scale),
    emissive: lp(a.emissive, b.emissive),
    tint: [lp(a.tint[0], b.tint[0]), lp(a.tint[1], b.tint[1]), lp(a.tint[2], b.tint[2])],
  };
}
