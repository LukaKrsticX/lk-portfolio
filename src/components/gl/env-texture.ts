import {
  DataTexture,
  EquirectangularReflectionMapping,
  LinearFilter,
  SRGBColorSpace,
} from "three";

export const ENV_WIDTH = 256;
export const ENV_HEIGHT = 128;

interface Hotspot {
  readonly u: number;
  readonly v: number;
  readonly radius: number;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
}

// Electric-blue key + cool fill + faint warm bounce, per the spec's single-accent rule.
const HOTSPOTS: readonly Hotspot[] = [
  { u: 0.22, v: 0.72, radius: 0.16, color: [77, 166, 232], intensity: 2.4 },
  { u: 0.78, v: 0.6, radius: 0.22, color: [46, 106, 180], intensity: 1.4 },
  { u: 0.5, v: 0.12, radius: 0.3, color: [190, 130, 95], intensity: 0.35 },
];

/** Dark-gradient equirect env with a few hotspots; three auto-PMREMs it on assignment. */
export function buildEnvironmentTexture(): DataTexture {
  const data = new Uint8Array(ENV_WIDTH * ENV_HEIGHT * 4);
  for (let y = 0; y < ENV_HEIGHT; y++) {
    for (let x = 0; x < ENV_WIDTH; x++) {
      const u = x / (ENV_WIDTH - 1);
      const v = y / (ENV_HEIGHT - 1);
      let r = 4 + 10 * v;
      let g = 5 + 12 * v;
      let b = 7 + 18 * v;
      for (const h of HOTSPOTS) {
        const duRaw = Math.abs(u - h.u);
        const du = Math.min(duRaw, 1 - duRaw); // horizontal wrap (equirect seam)
        const dv = v - h.v;
        const fall = Math.exp(-(du * du + dv * dv) / (h.radius * h.radius));
        r += h.color[0] * h.intensity * fall;
        g += h.color[1] * h.intensity * fall;
        b += h.color[2] * h.intensity * fall;
      }
      const i = (y * ENV_WIDTH + x) * 4;
      data[i] = Math.min(255, Math.round(r));
      data[i + 1] = Math.min(255, Math.round(g));
      data[i + 2] = Math.min(255, Math.round(b));
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, ENV_WIDTH, ENV_HEIGHT);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
