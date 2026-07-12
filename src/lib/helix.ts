import { clamp01, smoothstep01 } from "./scroll";

/** Staged tilt A/B for the operator (2026-07-12 night) — null = shipped control. */
export type HelixTiltVariant = "a" | "b" | null;

/** Rest tilt of the drift group. helixTiltAt() holds exactly this value until a
 * variant's first window opens, so the JSX rest pose stays continuous. */
export const HELIX_TILT_REST = -0.42;

// Windows MUST stay in sync with HelixRibbon: DRIFT mirrors the position-drift
// envelope ((p - 0.22) / 0.5); CONTACT is the approved landing window.
const DRIFT = { start: 0.22, span: 0.5 };
const CONTACT = { start: 0.85, span: 0.15 };

/**
 * rotation.z envelope for the drifting helix group, by staged variant:
 * - control (null): rights itself to -0.05 in the contact window (f6b94d7) —
 *   operator read this as a horizontal wave once the ribbon is center stage.
 * - "a": contact landing goes near-vertical (-1.25) instead of flat.
 * - "b": verticalizes with the center-drift (-1.05 by p 0.72, ≈-45° at p 0.5),
 *   holds, then the contact window completes to -1.35.
 */
export function helixTiltAt(p: number, variant: HelixTiltVariant): number {
  const contact = smoothstep01(clamp01((p - CONTACT.start) / CONTACT.span));
  if (variant === "a") return HELIX_TILT_REST - 0.83 * contact;
  if (variant === "b") {
    const drift = smoothstep01(clamp01((p - DRIFT.start) / DRIFT.span));
    return HELIX_TILT_REST - 0.63 * drift - 0.3 * contact;
  }
  return HELIX_TILT_REST + 0.37 * contact;
}

/**
 * Twist a PlaneGeometry position buffer (plane lying along x) into a helix strip:
 * each column of vertices rotates around the x axis by phase + u * turns * 2π.
 * Mutates and returns the buffer. Run once at mount; animate the mesh, not the verts.
 */
export function twistPlanePositions(
  positions: Float32Array,
  length: number,
  turns: number,
  phase = 0,
): Float32Array {
  for (let i = 0; i < positions.length; i += 3) {
    const u = positions[i] / length + 0.5;
    const angle = phase + u * turns * Math.PI * 2;
    const y = positions[i + 1];
    const z = positions[i + 2];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions[i + 1] = y * cos - z * sin;
    positions[i + 2] = y * sin + z * cos;
  }
  return positions;
}
