"use client";
import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
} from "three";
import type { PointerState } from "./use-pointer-tracker";

const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SIM_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform float uDecay;
uniform float uAspect;
varying vec2 vUv;
void main() {
  float prev = texture2D(uPrev, vUv).r * uDecay;
  vec2 d = vUv - uPointer;
  d.x *= uAspect;
  float splat = exp(-dot(d, d) / 0.0008) * min(length(uVelocity) * 40.0, 1.0);
  gl_FragColor = vec4(min(prev + splat, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * Decaying pointer-trail texture in two quarter-res ping-pong FBOs.
 * drei useFBO defaults (HalfFloatType, LinearFilter) are load-bearing:
 * 8-bit targets quantize the decay and the trail gets stuck at low values.
 * Sim renders at useFrame priority -1 (runs before the default scene render;
 * negative priority does NOT take over rendering — only >0 does).
 */
export function usePointerRipple(
  pointer: RefObject<PointerState>,
  enabled: boolean,
): RefObject<Texture | null> {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const w = Math.max(8, Math.floor((size.width * dpr) / 4));
  const h = Math.max(8, Math.floor((size.height * dpr) / 4));
  // NOTE: setSize on resize disposes + reallocs — the trail resets on window
  // resize. Cosmetic and accepted.
  const fboA = useFBO(w, h, { depthBuffer: false, stencilBuffer: false });
  const fboB = useFBO(w, h, { depthBuffer: false, stencilBuffer: false });
  const targets = useRef({ read: fboA, write: fboB });
  const textureRef = useRef<Texture | null>(null);

  const sim = useMemo(() => {
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // Fullscreen triangle: 3 verts cover the viewport, no diagonal seam.
    const geo = new BufferGeometry();
    geo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    const material = new ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uPrev: { value: null },
        uPointer: { value: new Vector2(0.5, 0.5) },
        uVelocity: { value: new Vector2(0, 0) },
        uDecay: { value: 0.95 },
        uAspect: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(geo, material);
    mesh.frustumCulled = false; // vertex shader ignores matrices — culling would be wrong
    scene.add(mesh);
    return { scene, camera, material, geo };
  }, []);

  useEffect(
    () => () => {
      sim.geo.dispose();
      sim.material.dispose();
    },
    [sim],
  );

  useFrame(({ gl }) => {
    if (!enabled) return;
    const { read, write } = targets.current;
    const p = pointer.current;
    const u = sim.material.uniforms;
    u.uPrev.value = read.texture; // NEVER the write target — GL feedback loop
    u.uPointer.value.copy(p.uv);
    u.uVelocity.value.copy(p.velocity);
    p.velocity.set(0, 0); // consume-once: no new move → no new splat
    u.uAspect.value = size.width / Math.max(1, size.height);

    gl.setRenderTarget(write);
    gl.render(sim.scene, sim.camera);
    gl.setRenderTarget(null);

    textureRef.current = write.texture;
    targets.current = { read: write, write: read };
  }, -1);

  return textureRef;
}
