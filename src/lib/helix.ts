import { clamp01, smoothstep01 } from "./scroll";

/** Rest tilt of the drift group. helixTiltAt() holds exactly this value until
 * the contact window opens, so the JSX rest pose stays continuous. */
export const HELIX_TILT_REST = -0.42;

// Window MUST stay in sync with HelixRibbon: CONTACT is the #contact landing window.
const CONTACT = { start: 0.85, span: 0.15 };

/**
 * rotation.z envelope for the drifting helix group: holds the rest tilt, then
 * the #contact landing window takes the ribbon near-vertical (-1.25). A/B
 * winner over a flat -0.05 control that read as a horizontal wave center stage.
 */
export function helixTiltAt(p: number): number {
  const contact = smoothstep01(clamp01((p - CONTACT.start) / CONTACT.span));
  return HELIX_TILT_REST - 0.83 * contact;
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
