"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, type IUniform, Material, PlaneGeometry } from "three";
import { debugChoice } from "@/lib/debug-flags";
import {
  AXIS_VARIANTS,
  buildHelixTable,
  HELIX_LENGTH,
  HELIX_REST,
  HELIX_TILT_REST,
  morphAt,
  type Variant,
} from "@/lib/helix-morph";
import { blendAt } from "@/lib/keypoints";
import { keypointsStore, scrollSignals } from "@/lib/scroll";

const SEGMENTS = 256;
const HELIX_SCRUB = 2.5 * Math.PI;
const ENERGY_BOOST = 1.5;
// Velocity bow: strand bends up to ±BEND_AMP world units at full smoothed velocity. Gated on
// uVel so rest (velSm→0) is bow-free — the strip's settled shape is exactly the keyframe.
const BEND_AMP = 0.35;
// ONE program for both strands: identical cache-key literal → three shares the compiled program
// (usedTimes refcount), while onBeforeCompile still runs per-material so each keeps its own uPhase.
const STRAND_CACHE_KEY = "helix-strand-parametric-v1";

type Uniforms = Record<string, IUniform>;

// Uniform declarations prepended to the stock physical vertex shader (after <common>).
const UNIFORM_DECL = /* glsl */ `
uniform float uPhase;
uniform float uRadius;
uniform float uTurns;
uniform float uPitch;
uniform float uWidth;
uniform float uBendAmp;
uniform float uVel;
uniform float uTime;
`;

// Replaces #include <begin_vertex>: place each flat-plane vertex on an analytic helix frame.
// u ∈ [0,1] along the strip; angle winds uTurns times; the strip sits at radius uRadius and
// spans ±uWidth/2 radially (unit-height PlaneGeometry → position.y ∈ [−0.5,0.5]). The velocity
// bow travels along the strand (uTime) with amplitude ∝ uVel so it vanishes at rest.
const BEGIN_VERTEX = /* glsl */ `
  vec3 transformed;
  {
    float u = position.x / ${HELIX_LENGTH.toFixed(1)} + 0.5;
    float a = uPhase + u * uTurns * 6.28318530718;
    float r = uRadius + position.y * uWidth;
    transformed = vec3(position.x * uPitch, r * cos(a), r * sin(a));
    transformed.y += uBendAmp * uVel * sin(u * 3.14159265359 - uTime * 1.5);
  }
`;

// Replaces #include <beginnormal_vertex>: rotate the plane normal (0,0,1) by the same twist
// frame. Analytic (ignores the du twist-rate shear) — fine for a thin iridescent ribbon.
const BEGIN_NORMAL = /* glsl */ `
  vec3 objectNormal;
  {
    float un = position.x / ${HELIX_LENGTH.toFixed(1)} + 0.5;
    float an = uPhase + un * uTurns * 6.28318530718;
    objectNormal = vec3(0.0, -sin(an), cos(an));
  }
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3( tangent.xyz );
  #endif
`;

/**
 * Clone Hero's physical material into a parametric helix strand: the twist moves from baked
 * geometry into onBeforeCompile so it becomes uniform-driven (identity — iridescence, env —
 * survives the clone). Set AFTER clone (clone drops custom hooks). The injected shader.uniforms
 * are stashed on mat.userData so useFrame can drive them; absent until the first compile.
 */
function makeStrandMaterial(base: Material, phase: number): Material {
  const mat = base.clone();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPhase = { value: phase };
    shader.uniforms.uRadius = { value: HELIX_REST.radius };
    shader.uniforms.uTurns = { value: HELIX_REST.turns };
    shader.uniforms.uPitch = { value: HELIX_REST.pitch };
    shader.uniforms.uWidth = { value: HELIX_REST.width };
    shader.uniforms.uBendAmp = { value: BEND_AMP };
    shader.uniforms.uVel = { value: 0 };
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${UNIFORM_DECL}`)
      .replace("#include <beginnormal_vertex>", BEGIN_NORMAL)
      .replace("#include <begin_vertex>", BEGIN_VERTEX);
    mat.userData.uniforms = shader.uniforms;
  };
  mat.customProgramCacheKey = () => STRAND_CACHE_KEY;
  return mat;
}

/** Injected uniforms for a strand once compiled, else null (pre-compile frames). */
function strandUniforms(mat: Material): Uniforms | null {
  return (mat.userData.uniforms as Uniforms | undefined) ?? null;
}

/**
 * Double helix as THE page axis: two strands (uPhase 0/π) sharing one flat geometry and one
 * compiled program, morphed per-section by the keyframe table. Group rotation.x is the spin
 * (ASSIGNED, never accumulated — scrub up rewinds exactly) plus the HELIX_SCRUB·p scroll phase;
 * the drift group carries the compositional pose (position/tilt/scale). ?axis=comp pins the
 * shape to rest (control); default/absent → morph.
 */
export function HelixRibbon({ material, choreo }: { material: Material; choreo: boolean }) {
  const drift = useRef<Group>(null);
  const group = useRef<Group>(null);
  const spinAcc = useRef(0);

  const variant = useMemo<Variant>(() => debugChoice("axis", AXIS_VARIANTS) ?? "morph", []);
  const table = useMemo(() => buildHelixTable(variant), [variant]);

  const geometry = useMemo(() => new PlaneGeometry(HELIX_LENGTH, 1, SEGMENTS, 1), []);
  const matA = useMemo(() => makeStrandMaterial(material, 0), [material]);
  const matB = useMemo(() => makeStrandMaterial(material, Math.PI), [material]);
  useEffect(
    () => () => {
      geometry.dispose();
      matA.dispose();
      matB.dispose();
    },
    [geometry, matA, matB],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30); // hidden-tab delta clamp
    spinAcc.current += dt * (0.22 + (choreo ? ENERGY_BOOST * scrollSignals.energy : 0));
    // choreo off → hold rest (== both variants' hero keyframe): calm control for soak bisection.
    const p = scrollSignals.p;
    const kf = choreo ? morphAt(table, blendAt(keypointsStore.current, p)) : HELIX_REST;
    const uVel = scrollSignals.velSm;
    for (const mat of [matA, matB]) {
      const u = strandUniforms(mat);
      if (!u) continue; // pre-compile frames: uniforms not injected yet
      u.uRadius.value = kf.radius;
      u.uTurns.value = kf.turns;
      u.uPitch.value = kf.pitch;
      u.uWidth.value = kf.width;
      u.uVel.value = uVel;
      u.uTime.value += dt;
    }
    if (group.current) {
      // Scroll phase ASSIGNED, never +='d — scrub up rewinds it exactly.
      group.current.rotation.x = spinAcc.current + (choreo ? HELIX_SCRUB * p : 0);
    }
    if (drift.current) {
      drift.current.position.set(kf.drift[0], kf.drift[1], kf.drift[2]);
      drift.current.rotation.z = kf.tiltZ; // single runtime writer of rotation.z
      drift.current.scale.setScalar(kf.scale);
    }
  });

  return (
    <group ref={drift} position={[HELIX_REST.drift[0], HELIX_REST.drift[1], HELIX_REST.drift[2]]} rotation={[0, 0, HELIX_TILT_REST]}>
      <group ref={group}>
        <mesh geometry={geometry} material={matA} />
        <mesh geometry={geometry} material={matB} />
      </group>
    </group>
  );
}
