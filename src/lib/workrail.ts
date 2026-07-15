// Work-section card rail — pure, no three. Two frames:
//   • cardPose(i,N) is AXIS-LOCAL: HelixCards mounts each card inside the morphing axis
//     group, so the pose inherits the work-keyframe composition (drift/tilt/scale) and the
//     cards live ON the opened helix. Radius 1.15 == the retired PORTAL_RING.radius (that
//     module is being reduced to prng.ts, so the ring-continuity constant moves here).
//   • railWaypoint(workP,N) is WORLD-space: it replaces the P2 two-point placeholder in
//     CameraRig — the camera dives card-to-card down the axis. No snap; the cascade settles.
// Every function is a pure function of its inputs (scrub-safe, no accumulation).

type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];

const DEG = Math.PI / 180;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const clampSym = (v: number, m: number): number => (v > m ? m : v < -m ? -m : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Card orbit radius around the axis (world units) — retired PORTAL_RING.radius, inlined for continuity. */
export const CARD_RADIUS = 1.15;
/** Per-card angular step around the axis. Adjacent cards differ by exactly this; the set is centered so it stays N-generic. */
export const CARD_ANGLE_STEP = -50 * DEG;
/** Axial spacing per card along the axis (local X, the helix's pitch direction). */
export const CARD_PITCH = 0.9;
/** Card yaw clamp — a far card never goes edge-on to the camera (the ROT_CAP ring discipline survives). */
export const ROT_CAP = 0.45;

// Centered index: the card set straddles the axis origin so it reads the same for any N.
const centered = (i: number, N: number): number => i - (N - 1) / 2;
// Angular position of card i around the axis (unclamped — the clamp is the card's YAW, not its place).
const cardAngle = (i: number, N: number): number => centered(i, N) * CARD_ANGLE_STEP;

/**
 * Axis-local pose of card i of N: position on the helix orbit (radius CARD_RADIUS in the local
 * YZ plane, stepping CARD_PITCH along the local X axis) plus a camera-ward yaw capped at ROT_CAP.
 */
export function cardPose(i: number, N: number): { position: Vec3; rotationY: number } {
  const a = cardAngle(i, N);
  return {
    position: [centered(i, N) * CARD_PITCH, CARD_RADIUS * Math.cos(a), CARD_RADIUS * Math.sin(a)],
    rotationY: clampSym(a, ROT_CAP),
  };
}

/** Linear card index in [0, N−1]: exact integer at each card center, monotonic in workP. */
export function cardProgress(workP: number, N: number): number {
  return clamp01(workP) * (N - 1);
}

// --- world-space camera rail ----------------------------------------------------------------
// The cards render inside the axis group at the WORK keyframe composition, so to frame them the
// rail transforms each card's axis-local pose into world space with that SAME composition
// (scale → rotateZ → translate — mirrors HelixRibbon's drift group / HelixCards' root group;
// keep in sync with helix-morph's `work` row), aims the camera AT the card, and stands off toward
// the +z viewer side. The camera z (dolly-in) then emerges from the cards' own depth spread.
// Caveats the visual pass owns: (1) the Hero tier scale (low = 0.9) is assumed 1 here — a minor
// low-tier offset; (2) the composition is exact only at the work-section center — away from it the
// live drift lags this fixed keyframe, but the cascade + camera damping absorb the small parallax.
const WORK_DRIFT: Vec3 = [0, 0, -1]; // helix-morph MORPH_ROWS.work.drift
const WORK_TILT_Z = -0.3; // helix-morph MORPH_ROWS.work.tiltZ
const WORK_SCALE = 1.05; // helix-morph MORPH_ROWS.work.scale
const RAIL_STANDOFF_Z = 3.6; // camera sits this far in +z ahead of the focused card
const RAIL_LATERAL_LEAD = 0.5; // camera hangs back toward center (< the card's x/y) so the dive reads as a pass-by
const RAIL_FOV = 34; // work-section fov
const RAIL_MOVE_XY: readonly [number, number] = [0.2, 0.12]; // pointer-parallax, quieted for the dive

/** Transform an axis-local point to world by the work-keyframe composition (scale → rotateZ → translate). */
function axisToWorld(local: Vec3): Vec3 {
  const sx = local[0] * WORK_SCALE;
  const sy = local[1] * WORK_SCALE;
  const sz = local[2] * WORK_SCALE;
  const c = Math.cos(WORK_TILT_Z);
  const s = Math.sin(WORK_TILT_Z);
  return [sx * c - sy * s + WORK_DRIFT[0], sx * s + sy * c + WORK_DRIFT[1], sz + WORK_DRIFT[2]];
}

/**
 * World-space camera waypoint for scroll progress workP across the work span, N cards.
 * Uses floor+fract on the linear card index to interpolate the current card's axis-local pose
 * — continuous everywhere (NO snap; the scroll cascade supplies the settle) — projects it to
 * world, and aims the camera at it from a +z standoff. Returns pos, look, the orienting
 * quaternion (camera −z → look), fov and parallax.
 */
export function railWaypoint(
  workP: number,
  N: number,
): { pos: Vec3; quat: Vec4; look: Vec3; fov: number; moveXY: readonly [number, number] } {
  const f = cardProgress(workP, N); // 0 .. N−1
  const i0 = Math.floor(f);
  const frac = f - i0;
  const i1 = Math.min(i0 + 1, N - 1);
  const a = cardPose(i0, N).position;
  const b = cardPose(i1, N).position;
  const look = axisToWorld([lerp(a[0], b[0], frac), lerp(a[1], b[1], frac), lerp(a[2], b[2], frac)]);
  const pos: Vec3 = [look[0] * RAIL_LATERAL_LEAD, look[1] * RAIL_LATERAL_LEAD, look[2] + RAIL_STANDOFF_Z];
  return { pos, quat: lookQuat(pos, look), look, fov: RAIL_FOV, moveXY: RAIL_MOVE_XY };
}

// --- quaternion helpers (mirror three's Object3D.lookAt convention: camera looks down −z) ----

/**
 * Quaternion orienting a camera at `pos` to look at `look` (with `up`), matching three's
 * Matrix4.lookAt → Quaternion.setFromRotationMatrix so the camera's local −z points at the target.
 */
export function lookQuat(pos: Vec3, look: Vec3, up: Vec3 = [0, 1, 0]): Vec4 {
  // z basis points from target back to eye (three's convention); x = up × z; y = z × x.
  let zx = pos[0] - look[0];
  let zy = pos[1] - look[1];
  let zz = pos[2] - look[2];
  let zl = Math.hypot(zx, zy, zz);
  if (zl === 0) {
    zz = 1;
    zl = 1;
  }
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz);
  if (xl === 0) {
    // up parallel to z — nudge z and retry once (three does the same fallback).
    zx += 1e-4;
    const zn = Math.hypot(zx, zy, zz);
    zx /= zn;
    zy /= zn;
    zz /= zn;
    xx = up[1] * zz - up[2] * zy;
    xy = up[2] * zx - up[0] * zz;
    xz = up[0] * zy - up[1] * zx;
  }
  const xn = Math.hypot(xx, xy, xz) || 1;
  xx /= xn;
  xy /= xn;
  xz /= xn;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  // Rotation matrix columns are (x, y, z); convert to a quaternion (three's setFromRotationMatrix).
  const m11 = xx,
    m12 = yx,
    m13 = zx;
  const m21 = xy,
    m22 = yy,
    m23 = zy;
  const m31 = xz,
    m32 = yz,
    m33 = zz;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const sN = 0.5 / Math.sqrt(trace + 1.0);
    return [(m32 - m23) * sN, (m13 - m31) * sN, (m21 - m12) * sN, 0.25 / sN];
  }
  if (m11 > m22 && m11 > m33) {
    const sN = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    return [0.25 * sN, (m12 + m21) / sN, (m13 + m31) / sN, (m32 - m23) / sN];
  }
  if (m22 > m33) {
    const sN = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    return [(m12 + m21) / sN, 0.25 * sN, (m23 + m32) / sN, (m13 - m31) / sN];
  }
  const sN = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
  return [(m13 + m31) / sN, (m23 + m32) / sN, 0.25 * sN, (m21 - m12) / sN];
}

/** The world-space forward (view) direction of a camera with quaternion q — i.e. q applied to (0,0,−1). */
export function quatForward(q: Vec4): Vec3 {
  const [x, y, z, w] = q;
  // v = (0,0,−1); v' = v + 2·qxyz × (qxyz × v + w·v).
  const vx = 0,
    vy = 0,
    vz = -1;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}
