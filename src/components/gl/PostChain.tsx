"use client";
// Hand-rolled tier-gated post chain (spec §7 — no postprocessing dep). Mounted ONLY on med+ with
// ?post≠0 (Scene gates the mount; low tier / demote-to-low / ?post=0 never mount it, so the
// auto-render path stays byte-for-byte today's). WHEN mounted it TAKES OVER rendering: useFrame at
// priority 1 disables R3F's automatic render (Phase-0 fact, verified in fiber), so this callback
// must call gl.render itself — scene → HDR RT → tent bloom → composite to screen. On unmount the
// priority>0 subscriber goes away and R3F resumes auto-render (clean handoff — no black frame).
//
// Colour pipeline: three renders to a render target with NoToneMapping + working (linear) colour
// space (three.module.js:18349 gates toneMapping on _currentRenderTarget===null), so sceneRT holds
// linear HDR. Bloom + grade happen in linear; the composite renders to SCREEN (null RT) where the
// <tonemapping_fragment> + <colorspace_fragment> chunks apply the renderer's ACESFilmic + sRGB —
// matching today's direct-render output, plus the filmic layer.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  HalfFloatType,
  Mesh,
  NoBlending,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  WebGLRenderTarget,
} from "three";
import { blendAt } from "@/lib/keypoints";
import { paletteAt } from "@/lib/palette";
import type { Tier } from "@/lib/quality";
import { keypointsStore, scrollSignals } from "@/lib/scroll";
import { fluidBus } from "./use-fluid-sim";

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// 3×3 tent (weights 1-2-1 / 2-4-2 / 1-2-1 ÷16) around uSrc's texel. Used for BOTH the downsample
// chain (NoBlending, target smaller) and the additive upsample (AdditiveBlending, target larger) —
// uTexel is always the SOURCE texel, so the upsample spreads a wider tent in target space.
const TENT_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uSrc, vUv) * 4.0;
  s += texture2D(uSrc, vUv + uTexel * vec2( 1.0,  0.0)) * 2.0;
  s += texture2D(uSrc, vUv + uTexel * vec2(-1.0,  0.0)) * 2.0;
  s += texture2D(uSrc, vUv + uTexel * vec2( 0.0,  1.0)) * 2.0;
  s += texture2D(uSrc, vUv + uTexel * vec2( 0.0, -1.0)) * 2.0;
  s += texture2D(uSrc, vUv + uTexel * vec2( 1.0,  1.0));
  s += texture2D(uSrc, vUv + uTexel * vec2(-1.0,  1.0));
  s += texture2D(uSrc, vUv + uTexel * vec2( 1.0, -1.0));
  s += texture2D(uSrc, vUv + uTexel * vec2(-1.0, -1.0));
  gl_FragColor = s / 16.0;
}
`;

// Final composite: scene (chromatic-split) + pow(bloom,1.8)·intensity + palette tint/contrast +
// whisper grain + gentle vignette, then ACES + sRGB via the chunk includes. Every stylistic term
// is neutral at the hero keyframe (tint [1,1,1], contrast 1) so p=0 ≈ scene + bloom only.
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uFluid;
uniform float uHasFluid;
uniform float uBloomIntensity;
uniform float uGrain;
uniform float uTime;
uniform float uVel;        // |velSm|, 0..1
uniform vec2  uShiftDir;   // 120° unit direction
uniform float uShiftBase;
uniform float uShiftVel;
uniform float uShiftFluid;
uniform vec3  uTint;
uniform float uContrast;
uniform float uVignette;
uniform vec2  uGrainScale;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  // Chromatic RGB shift @120° — subpixel at idle, opens on velocity + fluid edges.
  float fluidEdge = 0.0;
  if (uHasFluid > 0.5) fluidEdge = length(texture2D(uFluid, vUv).xy);
  float amt = uShiftBase + uShiftVel * uVel + uShiftFluid * fluidEdge;
  vec2 off = uShiftDir * amt;
  vec3 scene = vec3(
    texture2D(uScene, vUv + off).r,
    texture2D(uScene, vUv).g,
    texture2D(uScene, vUv - off).b
  );
  vec3 bloom = pow(max(texture2D(uBloom, vUv).rgb, 0.0), vec3(1.8));
  vec3 col = scene + bloom * uBloomIntensity;
  // Palette scrub: multiplicative tint + contrast about mid-grey (both neutral at hero).
  col *= uTint;
  col = (col - 0.5) * uContrast + 0.5;
  // Film grain — WHISPER, time-jittered per pixel (linear, pre-tonemap).
  float g = hash21(vUv * uGrainScale + fract(uTime) * 137.31) - 0.5;
  col += g * uGrain;
  // Gentle vignette.
  float vig = 1.0 - uVignette * smoothstep(0.55, 1.18, length(vUv - 0.5) * 1.9);
  col *= vig;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Tuning table (spec §6.4 — the verifier reviews these). Grain whispers; the chromatic base is
// sub-pixel at idle; bloom is a soft glow, not a wash.
const BLOOM_INTENSITY = 0.55;
const GRAIN = 0.03; // ±0.015 in linear — a whisper after ACES
const SHIFT_ANGLE = (120 * Math.PI) / 180;
const SHIFT_BASE = 0.0009; // ≈ sub-pixel at 1440w; the base chromatic split at idle
const SHIFT_VEL = 0.0016; // opens to a few px on a hard flick (× |velSm|, 0..1)
const SHIFT_FLUID = 0.02; // extra split along fluid velocity edges (× length(fluid.xy))
const VIGNETTE = 0.16;
const MIPS_FOR: Record<Tier, number> = { high: 4, med: 3, low: 3 };

function zeroTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); // fluid placeholder (uHasFluid gates use)
  tex.needsUpdate = true;
  return tex;
}

export function PostChain({ tier }: { tier: Tier }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const MIPS = MIPS_FOR[tier];
  const timeRef = useRef(0);

  // Static GPU objects (once): the fullscreen blit rig + the three pass materials + fluid stub.
  const rig = useMemo(() => {
    const fsScene = new Scene();
    const fsCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new Mesh(geo);
    mesh.frustumCulled = false;
    fsScene.add(mesh);

    const tentDown = new ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: TENT_FRAG,
      uniforms: { uSrc: { value: null }, uTexel: { value: new Vector2() } },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    const tentUp = new ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: TENT_FRAG,
      uniforms: { uSrc: { value: null }, uTexel: { value: new Vector2() } },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: AdditiveBlending,
    });
    const fluidStub = zeroTexture();
    const composite = new ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        uScene: { value: null },
        uBloom: { value: null },
        uFluid: { value: fluidStub },
        uHasFluid: { value: 0 },
        uBloomIntensity: { value: BLOOM_INTENSITY },
        uGrain: { value: GRAIN },
        uTime: { value: 0 },
        uVel: { value: 0 },
        uShiftDir: { value: new Vector2(Math.cos(SHIFT_ANGLE), Math.sin(SHIFT_ANGLE)) },
        uShiftBase: { value: SHIFT_BASE },
        uShiftVel: { value: SHIFT_VEL },
        uShiftFluid: { value: SHIFT_FLUID },
        uTint: { value: new Color(1, 1, 1) },
        uContrast: { value: 1 },
        uVignette: { value: VIGNETTE },
        uGrainScale: { value: new Vector2(1920, 1080) },
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    return { fsScene, fsCam, geo, mesh, tentDown, tentUp, composite, fluidStub };
  }, []);

  useEffect(
    () => () => {
      rig.geo.dispose();
      rig.tentDown.dispose();
      rig.tentUp.dispose();
      rig.composite.dispose();
      rig.fluidStub.dispose();
    },
    [rig],
  );

  // Render targets, rebuilt on resize / dpr / tier change (mip count). sceneRT keeps a depth buffer
  // (the 3D scene is depth-tested); the bloom mips do not. All HalfFloat (linear HDR for pow-bloom).
  const rts = useMemo(() => {
    const dbw = Math.max(2, Math.round(size.width * dpr));
    const dbh = Math.max(2, Math.round(size.height * dpr));
    const sceneRT = new WebGLRenderTarget(dbw, dbh, {
      type: HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const b0w = Math.max(2, Math.round(dbw * 0.3));
    const b0h = Math.max(2, Math.round(dbh * 0.3));
    const mips: WebGLRenderTarget[] = [];
    for (let i = 0; i < MIPS; i++) {
      const w = Math.max(2, Math.round(b0w / 2 ** i));
      const h = Math.max(2, Math.round(b0h / 2 ** i));
      mips.push(new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: false, stencilBuffer: false }));
    }
    return { sceneRT, mips };
  }, [size.width, size.height, dpr, MIPS]);

  // Dispose the OLD targets when this memo recomputes (resize/dpr/tier) or on unmount — drei's
  // auto-resize is bypassed here (custom per-mip resolutions), so disposal is manual + explicit.
  useEffect(
    () => () => {
      rts.sceneRT.dispose();
      for (const m of rts.mips) m.dispose();
    },
    [rts],
  );

  useFrame(() => {
    const { sceneRT, mips } = rts;
    const { tentDown, tentUp, composite, fsScene, fsCam, mesh } = rig;
    const dt = 1 / 60;
    timeRef.current += dt;

    const blit = (mat: ShaderMaterial, target: WebGLRenderTarget | null): void => {
      mesh.material = mat;
      gl.setRenderTarget(target);
      gl.render(fsScene, fsCam);
    };

    // --- update composite uniforms (palette scrub + velocity + fluid) ---
    const pal = paletteAt(blendAt(keypointsStore.current, scrollSignals.p));
    const u = composite.uniforms;
    (u.uTint.value as Color).setRGB(pal.tint[0], pal.tint[1], pal.tint[2]);
    u.uContrast.value = pal.contrast;
    u.uVel.value = Math.min(1, Math.abs(scrollSignals.velSm));
    u.uTime.value = timeRef.current;
    const fluidTex: Texture | null = fluidBus.current;
    u.uFluid.value = fluidTex ?? rig.fluidStub;
    u.uHasFluid.value = fluidTex ? 1 : 0;

    const prevAutoClear = gl.autoClear;

    // 1. Scene → sceneRT (linear HDR; three uses NoToneMapping for a non-null target).
    gl.autoClear = true;
    gl.setRenderTarget(sceneRT);
    gl.render(scene, camera);

    // 2. Downsample chain: sceneRT → mip0 (threshold-0 prefilter) → … half-res each step.
    tentDown.uniforms.uSrc.value = sceneRT.texture;
    (tentDown.uniforms.uTexel.value as Vector2).set(1 / sceneRT.width, 1 / sceneRT.height);
    blit(tentDown, mips[0]);
    for (let i = 1; i < mips.length; i++) {
      tentDown.uniforms.uSrc.value = mips[i - 1].texture;
      (tentDown.uniforms.uTexel.value as Vector2).set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
      blit(tentDown, mips[i]);
    }

    // 3. Additive upsample: mip[i] tent-blurred ADDED onto mip[i-1] (no clear — accumulate).
    gl.autoClear = false;
    for (let i = mips.length - 1; i >= 1; i--) {
      tentUp.uniforms.uSrc.value = mips[i].texture;
      (tentUp.uniforms.uTexel.value as Vector2).set(1 / mips[i].width, 1 / mips[i].height);
      blit(tentUp, mips[i - 1]);
    }
    gl.autoClear = prevAutoClear;

    // 4. Composite → screen (null target → ACES + sRGB via the chunk includes).
    u.uScene.value = sceneRT.texture;
    u.uBloom.value = mips[0].texture;
    blit(composite, null);

    gl.setRenderTarget(null); // hand the renderer back in its expected state
  }, 1); // priority 1 > 0 → R3F auto-render OFF; this callback owns the frame

  return null;
}
