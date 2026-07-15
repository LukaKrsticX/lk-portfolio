"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from "three";
import { scrollSignals } from "@/lib/scroll";
import { alphaEff } from "@/lib/virtual-scroll";

// Title plane world size (matches the card width; short height for a single line).
const TITLE_W = 1.6;
const TITLE_H = 0.4;
// Canvas at 2× the plane's target on-screen density (crisp glyphs; drawn ONCE per mount).
const CANVAS_W = 1024;
const CANVAS_H = 256;

const ECHO_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Velocity title echo. uEcho = |velSm| (extra α0.05 smoothed). EVERY echo displacement is scaled
// by uEcho, and the whole echoed sample is folded back onto the clean base by an OUTER mix(base,
// echoed, uEcho): at rest uEcho = 0 → mix returns `base` EXACTLY (a single clean texel), so the
// title is pixel-identical to a static render. On a hard flick the ghost columns drag, the RGB
// channels split @120°, and the whole thing streaks down.
const ECHO_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uEcho;
varying vec2 vUv;
const float DEG120 = 2.09439510239; // 120° in radians
void main() {
  vec4 base = texture2D(uMap, vUv);
  // Ghost columns: quantize x into 15 bands (fract(uv.x*15) → per-column phase), each band
  // dragged vertically by 0.15·uEcho with a stable per-band jitter. All motion ∝ uEcho.
  float band = floor(vUv.x * 15.0);
  float jitter = fract(sin(band * 12.9898) * 43758.5453);
  vec2 drag = vec2(0.0, 0.15 * uEcho * (0.5 + jitter));
  // RGB split @120°, magnitude ramps 0.001→0.02 and is itself ×uEcho (double-zero at rest).
  float split = mix(0.001, 0.02, uEcho) * uEcho;
  vec2 dR = vec2(1.0, 0.0) * split;
  vec2 dG = vec2(cos(DEG120), sin(DEG120)) * split;
  vec2 dB = vec2(cos(2.0 * DEG120), sin(2.0 * DEG120)) * split;
  vec4 echoed = vec4(
    texture2D(uMap, vUv + drag + dR).r,
    texture2D(uMap, vUv + drag + dG).g,
    texture2D(uMap, vUv + drag + dB).b,
    texture2D(uMap, vUv + drag).a
  );
  // OUTER gate: mix(base, echoed, 0.0) === base exactly → settled purity is structural.
  gl_FragColor = mix(base, echoed, clamp(uEcho, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Draw the title once into a 2× canvas: uppercase mono (site --font-mono), site --text color, transparent bg. */
function drawTitle(text: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas; // jsdom/no-2d: blank texture (component is never mounted in tests)
  const label = text.toUpperCase();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8f4ff"; // globals.css --text
  // Fit the label to ~92% of the canvas width; JetBrains Mono → monospace fallback matches the site.
  let size = 132;
  ctx.font = `600 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  const maxW = CANVAS_W * 0.92;
  const w = ctx.measureText(label).width;
  if (w > maxW) {
    size = Math.floor((size * maxW) / w);
    ctx.font = `600 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  }
  ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2);
  return canvas;
}

type Vec3 = [number, number, number];

/**
 * A case title as a GL plane beside its card, carrying the velocity echo. The CanvasTexture is
 * rendered once at mount (no per-frame redraw); only the uEcho uniform moves per frame. Disposes
 * the texture/material/geometry on unmount (the canvas element is then GC'd).
 */
export function CardTitle({ text, position }: { text: string; position: Vec3 }) {
  const { geometry, material, texture } = useMemo(() => {
    const tex = new CanvasTexture(drawTitle(text));
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter; // no mipmaps for a single-line label (avoids NPOT/mip churn)
    tex.magFilter = LinearFilter;
    const mat = new ShaderMaterial({
      uniforms: { uMap: { value: tex }, uEcho: { value: 0 } },
      vertexShader: ECHO_VERT,
      fragmentShader: ECHO_FRAG,
      side: DoubleSide,
      // Constant at construction (trap discipline: no runtime transparent/depthWrite toggles).
      transparent: true,
      depthWrite: false,
    });
    return { geometry: new PlaneGeometry(TITLE_W, TITLE_H), material: mat, texture: tex };
  }, [text]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
    [geometry, material, texture],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // uEcho = |velSm|, extra α0.05 smoothed — a long tail so the ghost lingers a touch past the flick.
    const target = Math.abs(scrollSignals.velSm);
    const u = material.uniforms.uEcho;
    u.value += (target - u.value) * alphaEff(0.05, dt);
  });

  return <mesh geometry={geometry} material={material} position={position} />;
}
