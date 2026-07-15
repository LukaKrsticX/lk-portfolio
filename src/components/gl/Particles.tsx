"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  Color,
  DataTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
} from "three";
import { site } from "@/content/site";
import {
  createCardTrigger,
  createPortalTrigger,
  createSectionTrigger,
} from "@/lib/burst-triggers";
import {
  BURST_DRAG,
  BURST_EXPIRY,
  BURST_GRAVITY,
  BURST_SLOTS,
  BURST_SPEED,
  buildSeeds,
  createBurstManager,
  POOL_SIZE,
  type Vec3,
} from "@/lib/particles";
import { isPortalActive } from "@/lib/portal-store";
import type { Tier } from "@/lib/quality";
import { keypointsStore, scrollSignals } from "@/lib/scroll";
import { cardProgress, cardPose } from "@/lib/workrail";

// --- field + look constants (all analytic; tune in the P6 pass) -------------------------------
const FIELD_LEN = 9; // axial spread (helix LENGTH is 7 — the field overhangs both ends)
const RAD_MIN = 0.4; // inner cylinder radius (clear of the axis core)
const RAD_MAX = 2.2; // outer radius (past the cards at 1.15, into the frame edge)
const SPRITE = 0.03; // world size of one sprite quad
const SIZE_REF = 3.0; // depth at which a sprite is full-size (size attenuation reference)
const STREAK_K = 1.2; // streak elongation per unit |velSm| (the f181 comet read)
const TUMBLE = 3.0; // confetti spin rate (rad/s of burst age) at full seed
const AMBIENT_A = 0.1; // ambient sprite alpha (modest — P6 bloom lifts it)
const BURST_A = 0.55; // confetti sprite alpha at burst peak
const FLUID_K = 0.25; // fluid-advection nudge scale (med+ only)

// Burst strengths per source (scale launch speed + confetti brightness).
const SECTION_STRENGTH = 1.0;
const CARD_STRENGTH = 0.85;
const PORTAL_STRENGTH = 1.2;

const AXIS_ORIGIN: Vec3 = [0, 0, 0]; // section/portal bursts spray from the axis core

const f = (n: number): string => n.toFixed(6); // GLSL float literal (needs a decimal point)

// The vertex shader is the whole simulation: ambient cylindrical drift + twinkle + size
// attenuation, plus the winning burst's analytic ballistic offset, plus velocity streak stretch,
// plus the med+ fluid nudge. The burst math is injected from particles.ts (DRAG/GRAV/SPEED/EXPIRY)
// so it is 1:1 with the vitest-verified TS — see seedToBurstDir / burstOffset there.
const PARTICLE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uVel;
uniform vec4 uBursts[${BURST_SLOTS}];
uniform float uBurstStr[${BURST_SLOTS}];
uniform sampler2D uFluid;
uniform float uHasFluid;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

const float DRAG = ${f(BURST_DRAG)};
const float GRAV = ${f(BURST_GRAVITY)};
const float SPEED = ${f(BURST_SPEED)};
const float EXPIRY = ${f(BURST_EXPIRY)};
const float TAU2PI = 6.28318530718;

// 1:1 with particles.ts seedToBurstDir — upward-biased unit direction from two seed scalars.
vec3 seedBurstDir(vec4 s) {
  float az = s.x * TAU2PI;
  float el = 0.18 + 1.22 * s.y;
  float ce = cos(el);
  return vec3(cos(az) * ce, sin(el), sin(az) * ce);
}
// 1:1 with particles.ts burstOffset — closed-form ballistic + linear drag + gravity from age tau.
vec3 burstOffset(vec3 dir, float speed, float tau) {
  float e = exp(-DRAG * tau);
  float imp = (1.0 - e) / DRAG;
  float vss = -GRAV / DRAG;
  vec3 o = dir * speed * imp;
  o.y += vss * (tau - imp);
  return o;
}

void main() {
  vUv = uv;

  // --- ambient: slow cylindrical drift around the axis (local X) + a hash flow wobble ---------
  float ax = (aSeed.x - 0.5) * ${f(FIELD_LEN)};
  float baseAngle = aSeed.y * TAU2PI;
  float baseRad = mix(${f(RAD_MIN)}, ${f(RAD_MAX)}, aSeed.z);
  float spin = (step(0.5, aSeed.z) * 2.0 - 1.0); // half the field orbits each way
  float ang = baseAngle + uTime * (0.05 + aSeed.w * 0.08) * spin + sin(uTime * 0.2 + aSeed.x * 10.0) * 0.3;
  float rad = baseRad + sin(uTime * 0.13 + aSeed.y * 8.0) * 0.06;
  vec3 home = vec3(ax, rad * cos(ang), rad * sin(ang));

  // --- fluid advection nudge (med+; uHasFluid=0 on low → exact no-op) -------------------------
  if (uHasFluid > 0.5) {
    vec4 clip0 = projectionMatrix * modelViewMatrix * vec4(home, 1.0);
    vec2 sUv = clip0.xy / clip0.w * 0.5 + 0.5;
    vec2 flow = texture2D(uFluid, sUv).xy;
    home.xy += flow * ${f(FLUID_K)};
  }

  // --- winning burst: pick the single strongest live burst this particle belongs to ----------
  vec3 burstPos = home;
  float bestW = 0.0;
  float chosenTau = 0.0;
  for (int b = 0; b < ${BURST_SLOTS}; b++) {
    float str = uBurstStr[b];
    float tau = uTime - uBursts[b].w;
    // membership: ~half the field per burst, keyed by seed + slot, so bursts recruit distinct sprays
    float member = step(0.5, fract(sin(dot(aSeed.xy, vec2(12.9898, 78.233)) + float(b) * 17.17) * 43758.5453));
    float aliveB = step(1e-4, str) * step(0.0, tau) * step(tau, EXPIRY) * member;
    float env = aliveB * (1.0 - clamp(tau / EXPIRY, 0.0, 1.0));
    if (env > bestW) {
      bestW = env;
      chosenTau = tau;
      vec3 dir = seedBurstDir(aSeed);
      float speed = SPEED * str * (0.6 + 0.4 * aSeed.w);
      burstPos = uBursts[b].xyz + burstOffset(dir, speed, tau);
    }
  }
  vec3 pos = mix(home, burstPos, bestW);

  // --- billboard + size attenuation + streak stretch + tumble --------------------------------
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.001, -mv.z);
  float atten = clamp(${f(SIZE_REF)} / depth, 0.35, 3.0);
  float sx = ${f(SPRITE)} * atten;
  float sy = ${f(SPRITE)} * atten * (1.0 + ${f(STREAK_K)} * abs(uVel)); // stretch along screen-Y (scroll axis)
  float tang = chosenTau * ${f(TUMBLE)} * (aSeed.w * 2.0 - 1.0) * step(0.001, bestW);
  float ca = cos(tang);
  float sa = sin(tang);
  vec2 corner = mat2(ca, -sa, sa, ca) * position.xy; // position.xy ∈ [-0.5,0.5] (PlaneGeometry)
  mv.xy += corner * vec2(sx, sy);
  gl_Position = projectionMatrix * mv;

  // --- colour + alpha: ambient cool glint vs confetti palette flip, twinkle at 5 rad/s -------
  vec3 ambientCol = uColorA * 0.55;
  vec3 confettiCol = mix(uColorA, uColorB, step(0.5, aSeed.z));
  vColor = mix(ambientCol, confettiCol, bestW);
  float twinkle = 0.6 + 0.4 * sin(uTime * 5.0 + aSeed.x * 30.0);
  vAlpha = mix(${f(AMBIENT_A)} * twinkle, ${f(BURST_A)}, bestW);
}
`;

const PARTICLE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  // Soft round sprite: radial falloff to the quad edge, additive so it reads as a glint.
  float d = length(vUv - 0.5) * 2.0;
  float sprite = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor * sprite, sprite * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** 1×1 transparent texture bound to uFluid when no fluid RT exists (low tier / ?fluid=0). Never sampled there (uHasFluid=0). */
function makeDummyFluid(): DataTexture {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Analytic particle pool (D4 — one InstancedMesh, all motion closed-form in the vertex shader; no
 * position/velocity FBO). Ambient cylindrical drift + twinkle at rest; confetti bursts on section
 * crossings / card arrivals / portal opens (the burst math is the vitest-verified particles.ts port);
 * velocity streaks on hard flicks; a fluid-advection drift nudge on med+. This component is the
 * single writer of its burst uniforms — it owns the trigger evaluation + emit, assigns every uniform
 * per frame, and accumulates ONLY uTime. ?fx=0 drops it; mounted inside Hero's tier-scale group.
 */
export function Particles({ tier, fluid }: { tier: Tier; fluid: RefObject<Texture | null> }) {
  const mesh = useRef<Mesh>(null);
  const time = useRef(0);

  const bursts = useMemo(() => createBurstManager(), []);
  const sectionTrig = useMemo(() => createSectionTrigger(), []);
  const cardTrig = useMemo(() => createCardTrigger(), []);
  const portalTrig = useMemo(() => createPortalTrigger(), []);
  const cardCount = site.cases.length;

  const dummyFluid = useMemo(() => makeDummyFluid(), []);

  const geometry = useMemo(() => {
    const count = POOL_SIZE[tier];
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    geo.setAttribute("aSeed", new InstancedBufferAttribute(buildSeeds(count), 4));
    geo.instanceCount = count;
    // NOTE: do NOT dispose `quad` — its BufferAttributes are now owned by `geo` (shared refs).
    // quad holds no GPU buffers (never rendered) and is GC'd; geo.dispose() frees the attributes.
    return geo;
  }, [tier]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uVel: { value: 0 },
          uBursts: { value: new Float32Array(BURST_SLOTS * 4) },
          uBurstStr: { value: new Float32Array(BURST_SLOTS) },
          uFluid: { value: dummyFluid },
          uHasFluid: { value: 0 },
          uColorA: { value: new Color("#4da6e8") }, // site --accent
          uColorB: { value: new Color("#ffd27f") }, // warm confetti flip
        },
        // Constant at construction (recompile-trap discipline): never toggled at runtime.
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [dummyFluid],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      dummyFluid.dispose();
    },
    [geometry, material, dummyFluid],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30); // hidden-tab delta clamp
    time.current += dt; // the ONE accumulation — everything else is assigned
    const tNow = time.current;
    const u = material.uniforms;

    // --- triggers → emit (this component is the single burst writer) --------------------------
    if (sectionTrig.update(keypointsStore.current, scrollSignals.p)) {
      bursts.emit(AXIS_ORIGIN, SECTION_STRENGTH, tNow);
    }
    if (cardTrig.update(scrollSignals.workP, cardCount)) {
      const i = Math.round(cardProgress(scrollSignals.workP, cardCount));
      bursts.emit(cardPose(i, cardCount).position, CARD_STRENGTH, tNow);
    }
    if (portalTrig.update(isPortalActive())) {
      bursts.emit(AXIS_ORIGIN, PORTAL_STRENGTH, tNow);
    }

    // --- assign uniforms (ASSIGN, never accumulate) -------------------------------------------
    const bu = bursts.uniformsAt(tNow);
    (u.uBursts.value as Float32Array).set(bu.slots);
    (u.uBurstStr.value as Float32Array).set(bu.strengths);
    u.uTime.value = tNow;
    u.uVel.value = scrollSignals.velSm;
    const tex = fluid.current;
    u.uFluid.value = tex ?? dummyFluid;
    u.uHasFluid.value = tex ? 1 : 0;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}
