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
