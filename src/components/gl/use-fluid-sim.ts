"use client";
import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
} from "three";
import type { Tier } from "@/lib/quality";
import type { PointerState } from "./use-pointer-tracker";

// Sim resolution (long edge) per tier — 256 high / 192 med / OFF low. Low keeps the existing
// pointer-ripple as its trail language (RippleBackground untouched), so the hook returns a null ref.
const SIM_RES: Record<Tier, number | null> = { high: 256, med: 192, low: null };

// Study constants (D4): dissipation 0.98, curl-ish rotation ~30 (a cheap pressure-free swirl —
// the advection offset is rotated by a small angle that scales with local speed, NOT a real
// Navier–Stokes curl). Splat is a Gaussian of the pointer with velocity injected into rg.
const DISSIPATION = 0.98;
const CURL = 30.0;
const ADVECT_SCALE = 1.0;
const SPLAT_RADIUS = 0.0016; // Gaussian falloff in uv² (aspect-corrected)
const SPLAT_FORCE = 6.0; // velocity injected per unit pointer delta
const SPLAT_DEN = 1.2; // density injected (b channel — a visible dye for the composite/particles)

const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Single FUSED pass: advect the velocity field by itself (curl-rotated backtrace), dissipate,
// then splat the pointer. rg = velocity, b = dye density. Half-float RT (signed velocity needs it).
const SIM_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uPointer;
uniform vec2 uPointerVel;
uniform float uAspect;
uniform vec2 uTexel;
varying vec2 vUv;

const float DISSIPATION = ${DISSIPATION.toFixed(6)};
const float CURL = ${CURL.toFixed(6)};
const float ADVECT_SCALE = ${ADVECT_SCALE.toFixed(6)};
const float SPLAT_RADIUS = ${SPLAT_RADIUS.toFixed(6)};
const float SPLAT_FORCE = ${SPLAT_FORCE.toFixed(6)};
const float SPLAT_DEN = ${SPLAT_DEN.toFixed(6)};

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  vec2 vel = prev.xy;
  // Curl-flavored swirl: rotate the backtrace offset by a small angle that grows with local speed.
  float speed = length(vel);
  float curlAng = CURL * 0.0006 * speed;
  float c = cos(curlAng);
  float s = sin(curlAng);
  vec2 off = mat2(c, -s, s, c) * (vel * uTexel * ADVECT_SCALE);
  vec4 advected = texture2D(uPrev, vUv - off) * DISSIPATION;

  // Pointer splat: Gaussian in aspect-corrected uv, velocity into rg, dye into b.
  vec2 d = vUv - uPointer;
  d.x *= uAspect;
  float g = exp(-dot(d, d) / SPLAT_RADIUS);
  vec2 outVel = advected.xy + uPointerVel * (g * SPLAT_FORCE);
  float outDen = clamp(advected.z + g * length(uPointerVel) * SPLAT_DEN, 0.0, 1.0);
  gl_FragColor = vec4(outVel, outDen, 1.0);
}
`;

/**
 * Mouse-fluid trail (D4 — the one real sim, med+ only). Pressure-free splat+advect+dissipate in a
 * half-float ping-pong (skeleton from use-pointer-ripple), a single fused pass. Its output (rg =
 * velocity, b = dye) feeds the particle drift now and the P6 composite later. On LOW tier — or with
 * ?fluid=0 — the hook allocates nothing and returns a permanently-null ref, leaving RippleBackground
 * as the low-tier trail language, untouched.
 *
 * Pointer velocity here is a self-owned per-frame uv delta (prevUv), NOT the ripple's consume-once
 * `pointer.velocity` — so the two sims never fight over that one shared accumulator regardless of
 * useFrame ordering.
 */
export function useFluidSim(
  tier: Tier,
  pointer: RefObject<PointerState>,
  enabled: boolean,
): RefObject<Texture | null> {
  const res = SIM_RES[tier];
  const size = useThree((s) => s.size);
  const active = enabled && res !== null;

  // Aspect-correct dimensions from the long edge `res` (isotropic flow, uv-correct sampling).
  const longEdge = res ?? 8;
  const aspect = size.width / Math.max(1, size.height);
  const w = aspect >= 1 ? longEdge : Math.max(8, Math.round(longEdge * aspect));
  const h = aspect >= 1 ? Math.max(8, Math.round(longEdge / aspect)) : longEdge;

  const fboA = useFBO(w, h, { type: HalfFloatType, depthBuffer: false, stencilBuffer: false });
  const fboB = useFBO(w, h, { type: HalfFloatType, depthBuffer: false, stencilBuffer: false });
  const targets = useRef({ read: fboA, write: fboB });
  const textureRef = useRef<Texture | null>(null);
  const prevUv = useRef(new Vector2(0.5, 0.5));
  const primed = useRef(false);

  const sim = useMemo(() => {
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
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
        uPointerVel: { value: new Vector2(0, 0) },
        uAspect: { value: 1 },
        uTexel: { value: new Vector2(1 / w, 1 / h) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, camera, material, geo };
  }, [w, h]);

  useEffect(
    () => () => {
      sim.geo.dispose();
      sim.material.dispose();
    },
    [sim],
  );

  // When the sim is off (low tier / ?fluid=0, or an active→inactive tier demote) null the ref so
  // Particles' uHasFluid stays 0. In an effect, not render (refs must not be written during render).
  useEffect(() => {
    if (!active) textureRef.current = null;
  }, [active]);

  useFrame(({ gl }) => {
    if (!active) return;
    const { read, write } = targets.current;
    const p = pointer.current;
    const u = sim.material.uniforms;

    // Self-owned pointer delta (decoupled from the ripple's consume-once velocity).
    if (!primed.current) {
      prevUv.current.copy(p.uv);
      primed.current = true;
    }
    const dx = p.uv.x - prevUv.current.x;
    const dy = p.uv.y - prevUv.current.y;
    prevUv.current.copy(p.uv);

    u.uPrev.value = read.texture; // NEVER the write target — GL feedback loop
    (u.uPointer.value as Vector2).copy(p.uv);
    (u.uPointerVel.value as Vector2).set(dx, dy);
    u.uAspect.value = size.width / Math.max(1, size.height);

    gl.setRenderTarget(write);
    gl.render(sim.scene, sim.camera);
    gl.setRenderTarget(null);

    textureRef.current = write.texture;
    targets.current = { read: write, write: read };
  }, -2); // before the ripple (−1) and the scene render (0); negative never takes over rendering

  return textureRef;
}
