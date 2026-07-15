"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  DataTexture,
  DoubleSide,
  Group,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
} from "three";
import { site } from "@/content/site";
import { debugChoice } from "@/lib/debug-flags";
import {
  AXIS_VARIANTS,
  buildHelixTable,
  HELIX_REST,
  HELIX_TILT_REST,
  morphAt,
  type Variant,
} from "@/lib/helix-morph";
import { blendAt } from "@/lib/keypoints";
import type { Tier } from "@/lib/quality";
import { keypointsStore, scrollSignals } from "@/lib/scroll";
import { cardPose } from "@/lib/workrail";
import { CardTitle } from "./CardTitle";
import { useCardRaycast } from "./use-card-raycast";
import { usePointerTracker } from "./use-pointer-tracker";

// Captures are 1600×1000 → the card keeps the 1.6:1.0 ratio in world units.
const CARD_W = 1.6;
const CARD_H = 1.0;
// #0a1420 placeholder (the scene base color) so a card reads as furniture while its capture loads.
const PLACEHOLDER_RGBA = [10, 20, 32, 255] as const;
// Horizontal smear offset at full smoothed velocity (UV units) — harvested from the CasePortals
// peel (5-tap directional blur, 0.016 ≈ 26px on the 1600px capture). uSmear = SMEAR_K·|velSm|.
const SMEAR_K = 0.016;
// Title plane offset above each card (card is 1.0 tall → 0.72 clears its top edge).
const TITLE_OFFSET: [number, number, number] = [0, 0.72, 0];

const CARD_VERT = /* glsl */ `
uniform float uHover;
uniform float uTime;
uniform float uIndex;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  // Hover push toward the camera. Cards face outward, so camera-ward is +local z.
  p.z += 0.2 * uHover;
  // Per-card breathing (their free-stagger idea, our amplitude): a gentle ±0.01 along z,
  // phase-staggered by index. Always on — this is the card's resting life, not a motion term.
  p.z += sin(uTime * 0.5 + uIndex * 1.3) * 0.01;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uSmear;
uniform float uHover;
uniform vec2 uHoverPoint;
uniform vec2 uCard;
varying vec2 vUv;
const vec3 SLATE = vec3(0.039, 0.078, 0.125); // #0a1420 — dark card-back (harvested)
const vec3 BRAND = vec3(0.30, 0.65, 0.91);    // #4da6e8 — site --accent, the brand pool/flash color
void main() {
  // 5-tap horizontal smear, per-tap offset uSmear = SMEAR_K·|velSm|. SETTLED PURITY: at rest
  // velSm = 0 → uSmear = 0 → all five taps address the SAME texel → their average IS that texel
  // exactly (sum-of-identical / 5.0 is sub-ulp, gone after 8-bit quantization).
  vec3 tex = (texture2D(uMap, vUv - vec2(2.0 * uSmear, 0.0)).rgb
    + texture2D(uMap, vUv - vec2(uSmear, 0.0)).rgb
    + texture2D(uMap, vUv).rgb
    + texture2D(uMap, vUv + vec2(uSmear, 0.0)).rgb
    + texture2D(uMap, vUv + vec2(2.0 * uSmear, 0.0)).rgb) / 5.0;
  // Back faces render as the dark slate (DoubleSide is required for the back-face read AND for the
  // raycast to hit either face). A per-fragment constant — no motion term.
  vec3 col = mix(tex, SLATE, gl_FrontFacing ? 0.0 : 1.0);
  // Brightness 0.45 at rest → 0.7 on full hover. The case captures are near-white site
  // screenshots; the post bloom is deliberately unthresholded, so a brighter base washes
  // the whole work window (measured: 13% of pixels clipped at base 0.65 / high tier).
  col *= mix(0.45, 0.7, uHover);
  // Brand pool: radial lift whose center slides from the card center toward the cursor as hover
  // ramps; strength ramps 0.3→0.5 and is fully gated by uHover (exactly 0 with no hover).
  vec2 center = mix(vec2(0.5), uHoverPoint, uHover);
  float pool = smoothstep(0.5, 0.0, distance(vUv, center));
  col += BRAND * pool * (mix(0.3, 0.5, uHover) * uHover);
  // Transient flash at mid-hover: sin(π·uHover)·0.3 — exactly 0 at uHover 0 and 1, peaks at 0.5.
  col += BRAND * (sin(3.14159265359 * uHover) * 0.3);
  // Rounded-rect SDF corners (r 0.05, feather 0.008) in card space — harvested mask.
  vec2 pp = (vUv - 0.5) * uCard;
  vec2 q = abs(pp) - (0.5 * uCard - vec2(0.05));
  float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.05;
  float alpha = 1.0 - smoothstep(0.0, 0.008, sdf);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface CardResources {
  readonly slug: string;
  readonly title: string;
  readonly material: ShaderMaterial;
  readonly placeholder: DataTexture;
  readonly capture: Texture;
  readonly pose: { position: [number, number, number]; rotationY: number };
}

function makePlaceholder(): DataTexture {
  const tex = new DataTexture(new Uint8Array(PLACEHOLDER_RGBA), 1, 1);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Case captures as flat cards mounted ON the helix axis (D2 — CasePortals retired, its shader
 * vocabulary harvested: dark card-back slate, 5-tap directional smear, rounded-rect SDF corners,
 * settled-state purity). One single-quad card per case; the root group replicates the axis
 * morph composition (drift/tilt/scale — the SAME transform HelixRibbon's drift group applies), so
 * the cards live on the opened helix without inheriting its spin. Hover physics and the click stub
 * are a manual Raycaster (use-card-raycast); each card carries a velocity-echo title (CardTitle).
 * Visible only inside the /03 scroll window (workP gate). ?work=0 drops the whole GL layer.
 */
export function HelixCards({ tier, choreo }: { tier: Tier; choreo: boolean }) {
  const root = useRef<Group>(null);
  const meshes = useRef<(Mesh | null)[]>([]);
  const pointer = usePointerTracker();

  const variant = useMemo<Variant>(() => debugChoice("axis", AXIS_VARIANTS) ?? "morph", []);
  const table = useMemo(() => buildHelixTable(variant), [variant]);

  const geometry = useMemo(() => new PlaneGeometry(CARD_W, CARD_H), []);

  const cards = useMemo<readonly CardResources[]>(() => {
    const n = site.cases.length;
    const loader = new TextureLoader();
    return site.cases.map((c, i) => {
      const placeholder = makePlaceholder();
      const material = new ShaderMaterial({
        uniforms: {
          uMap: { value: placeholder },
          uTime: { value: 0 },
          uHover: { value: 0 },
          uHoverPoint: { value: new Vector2(0.5, 0.5) },
          uSmear: { value: 0 },
          uIndex: { value: i },
          uCard: { value: new Vector2(CARD_W, CARD_H) },
        },
        vertexShader: CARD_VERT,
        fragmentShader: CARD_FRAG,
        side: DoubleSide,
        // Constant at construction (trap discipline): toggling transparent/depthWrite mid-scrub
        // bumps material.version → full recompile hitch. Dark scene behind → cards read opaque.
        transparent: true,
        depthWrite: false,
      });
      // Async texture swap — no useLoader (the repo has no Suspense); placeholder holds until pixels land.
      const capture = loader.load(c.capture, (t) => {
        material.uniforms.uMap.value = t;
      });
      capture.colorSpace = SRGBColorSpace;
      if (tier !== "low") capture.anisotropy = 4; // tilted cards; skip on the weakest GPUs
      const { position, rotationY } = cardPose(i, n);
      const pose = { position: [position[0], position[1], position[2]] as [number, number, number], rotationY };
      return { slug: c.slug, title: c.title, material, placeholder, capture, pose };
    });
  }, [tier]);

  useEffect(
    () => () => {
      geometry.dispose();
      for (const card of cards) {
        card.material.dispose();
        card.placeholder.dispose();
        card.capture.dispose();
      }
    },
    [geometry, cards],
  );

  const materials = useMemo(() => cards.map((c) => c.material), [cards]);
  const slugs = useMemo(() => cards.map((c) => c.slug), [cards]);
  useCardRaycast({ meshes, materials, pointer, slugs, enabled: true });

  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    // Visible only inside the work scroll window (workP saturates at 0/1 outside it — same gate
    // the retired CasePortals used, so a settled card never lingers on screen).
    const workP = scrollSignals.workP;
    g.visible = workP > 0.001 && workP < 0.999;
    if (!g.visible) return;
    const dt = Math.min(delta, 1 / 30);
    // Axis composition: mirror HelixRibbon's drift group EXACTLY so cards share the strands' frame.
    const kf = choreo ? morphAt(table, blendAt(keypointsStore.current, scrollSignals.p)) : HELIX_REST;
    g.position.set(kf.drift[0], kf.drift[1], kf.drift[2]);
    g.rotation.z = kf.tiltZ;
    g.scale.setScalar(kf.scale);
    // Per-card runtime uniforms (uHover/uHoverPoint are the raycast hook's; here: time + smear).
    const smear = SMEAR_K * Math.abs(scrollSignals.velSm);
    for (const card of cards) {
      const u = card.material.uniforms;
      u.uTime.value += dt;
      u.uSmear.value = smear;
    }
  });

  return (
    <group
      ref={root}
      position={[HELIX_REST.drift[0], HELIX_REST.drift[1], HELIX_REST.drift[2]]}
      rotation={[0, 0, HELIX_TILT_REST]}
      visible={false}
    >
      {cards.map((card, i) => (
        <group key={card.slug} position={card.pose.position} rotation={[0, card.pose.rotationY, 0]}>
          <mesh
            geometry={geometry}
            material={card.material}
            ref={(m: Mesh | null) => {
              meshes.current[i] = m;
            }}
          />
          <CardTitle text={card.title} position={TITLE_OFFSET} />
        </group>
      ))}
    </group>
  );
}
