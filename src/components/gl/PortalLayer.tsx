"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  DataTexture,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from "three";
import { site } from "@/content/site";
import { debugFlag } from "@/lib/debug-flags";
import {
  closePortal,
  finalizePortalClosed,
  getPortalView,
  portalMachine,
  portalRig,
} from "@/lib/portal-store";
import { alphaEff } from "@/lib/virtual-scroll";

// Fullscreen wipe quad, drawn in NDC (the vertex bypasses the projection so it always fills the
// screen regardless of the camera fly-in). The revealed case backdrop lives INSIDE an fbm-feathered
// ring; outside the ring stays transparent so the live scene shows through until wipeT saturates.
const WIPE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0); // NDC fullscreen — no camera transform
}
`;

// OUR fbm (3-octave value noise — ~15 lines, no activetheory shader copied) feathers the ring edge.
const WIPE_FRAG = /* glsl */ `
uniform sampler2D uBackdrop;
uniform sampler2D uFluid;
uniform float uHasFluid;
uniform float uWipe;   // 0→1 ring radius (machine wipeT)
uniform float uDolly;  // 0→1 backdrop dolly (machine dollyT)
uniform float uTime;
uniform vec3 uTint;    // palette tint hook (P6 palette scrub drives it)
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;           // centered; corner dist ≈ 1.414 < 1.5 so wipeT=1 fully covers
  float d = length(p);
  float n = fbm(p * 3.0 + uTime * 0.15);
  // Ring radius 1.5·wipeT with an fbm feather of ±0.125, feather GATED by wipeT (exact-closed purity).
  float edge = 1.5 * uWipe + (n - 0.5) * 0.25 * uWipe;
  float inside = 1.0 - smoothstep(edge - 0.03, edge + 0.03, d);
  // Backdrop dolly: zoom cross from 2× down to 1× about center as the dolly track advances.
  float zoom = mix(2.0, 1.0, uDolly);
  vec2 buv = (vUv - 0.5) / zoom + 0.5;
  // Null-safe fluid smear hook (fluid sim lands in P5 — uHasFluid=0 until then).
  if (uHasFluid > 0.5) buv += (texture2D(uFluid, vUv).xy - 0.5) * 0.03 * uWipe;
  // Chromatic split: 0.005 inside the ring, 0.001 outside, extra at the rim band.
  float rimBand = smoothstep(0.06, 0.0, abs(d - edge));
  float split = mix(0.001, 0.005, inside) + rimBand * 0.01;
  vec3 bg = vec3(
    texture2D(uBackdrop, buv + vec2(split, 0.0)).r,
    texture2D(uBackdrop, buv).g,
    texture2D(uBackdrop, buv - vec2(split, 0.0)).b
  );
  bg *= uTint;
  // Rim brightness spike ×2 at the edge band (accent-colored halo), gated by wipe.
  vec3 col = bg + vec3(0.30, 0.65, 0.91) * rimBand * 2.0 * uWipe;
  // Reveal the backdrop inside the ring; the rim halo bleeds a touch outside it.
  float alpha = max(inside, rimBand * 0.5 * uWipe);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const PLACEHOLDER_RGBA = [4, 5, 7, 255] as const; // #040507 — the site background

function makePlaceholder(): DataTexture {
  const tex = new DataTexture(new Uint8Array(PLACEHOLDER_RGBA), 1, 1);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The portal wipe + case backdrop (GL side of the case entry). Always mounted when `?portal≠0`, it
 * is the single stepper of the portal machine: each frame it advances the machine, publishes camT
 * to the camera-override channel (CameraRig blends toward the card), and ASSIGNS the wipe/dolly
 * values into the shader (never accumulated — only uTime, the noise clock, accumulates, matching the
 * repo's other shaders). It owns the wheel exit accumulator (a px/s window → close past the 1200
 * threshold) and finalizes the scroll-lock release at the closing→closed edge. Material flags are
 * constant at construction (trap discipline: no runtime transparent/depth toggles → no recompile).
 */
export function PortalLayer() {
  const enabled = useMemo(() => debugFlag("portal"), []);
  const meshRef = useRef<Mesh>(null);
  const prevPhase = useRef<string>("closed");
  // Wheel exit accumulator: px this frame + a short-smoothed px/s rate.
  const wheelPx = useRef(0);
  const exitRate = useRef(0);

  const geometry = useMemo(() => new PlaneGeometry(2, 2), []);

  const { material, placeholder, fluidPlaceholder, captures } = useMemo(() => {
    const ph = makePlaceholder();
    const fluidPh = makePlaceholder();
    const loader = new TextureLoader();
    const caps: Texture[] = site.cases.map((c) => {
      const t = loader.load(c.capture);
      t.colorSpace = SRGBColorSpace;
      return t;
    });
    const mat = new ShaderMaterial({
      uniforms: {
        uBackdrop: { value: ph },
        uFluid: { value: fluidPh },
        uHasFluid: { value: 0 },
        uWipe: { value: 0 },
        uDolly: { value: 0 },
        uTime: { value: 0 },
        uTint: { value: new Color(0.85, 0.92, 1.0) },
      },
      vertexShader: WIPE_VERT,
      fragmentShader: WIPE_FRAG,
      // Constant at construction (trap discipline). Draws over the whole scene: no depth test/write,
      // additive-free straight alpha, highest render order.
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    return { material: mat, placeholder: ph, fluidPlaceholder: fluidPh, captures: caps };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      placeholder.dispose();
      fluidPlaceholder.dispose();
      for (const c of captures) c.dispose();
    },
    [geometry, material, placeholder, fluidPlaceholder, captures],
  );

  // Wheel exit accumulator — read-only (passive); VirtualScroll's own passive:false handler still
  // preventDefaults. Only accumulates while the portal is engaged.
  useEffect(() => {
    if (!enabled) return;
    const onWheel = (e: WheelEvent): void => {
      if (!portalRig.active) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      wheelPx.current += e.deltaY * unit;
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 1 / 30);
    const t = portalMachine.step(dt);
    portalRig.camT = t.camT; // camera-override channel — CameraRig blends by this

    // Release the scroll lock exactly at the closing→closed edge.
    if (prevPhase.current === "closing" && t.phase === "closed") finalizePortalClosed();
    prevPhase.current = t.phase;

    const mesh = meshRef.current;
    if (mesh) mesh.visible = t.phase !== "closed";

    const u = material.uniforms;
    u.uWipe.value = t.wipeT; // ASSIGN from the machine (never +=)
    u.uDolly.value = t.dollyT;
    u.uTime.value += dt; // the one legit accumulator — the noise clock
    const view = getPortalView();
    u.uBackdrop.value = captures[view.index] ?? placeholder;

    // Velocity exit: only while fully open. A hard flick (|px/s| ≥ 1200) closes.
    if (t.phase === "open") {
      const rate = wheelPx.current / Math.max(dt, 1e-3);
      wheelPx.current = 0;
      exitRate.current += (rate - exitRate.current) * alphaEff(0.3, dt);
      if (portalMachine.exitGesture(exitRate.current)) closePortal("velocity");
    } else {
      wheelPx.current = 0;
      exitRate.current = 0;
    }
  });

  if (!enabled) return null;
  return (
    <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={9999} frustumCulled={false} visible={false} />
  );
}
