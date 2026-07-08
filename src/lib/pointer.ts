/** Client pixel coords → GL uv in [0,1]², y pointing up. */
export function pointerToUv(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): [number, number] {
  if (width <= 0 || height <= 0) return [0.5, 0.5];
  return [clientX / width, 1 - clientY / height];
}
