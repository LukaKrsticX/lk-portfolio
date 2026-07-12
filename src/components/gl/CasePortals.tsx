"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  DataTexture,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
} from "three";
import { site } from "@/content/site";
import { explodeEnvelope, PORTAL_RING, ringPose, shardScatterAttrs } from "@/lib/portal";
import type { Tier } from "@/lib/quality";
import { scrollSignals } from "@/lib/scroll";

// Group placement knobs: the settled (active) card sits center-right so it
// never collides with the DOM text column (case cards live left/center in #work).
const GROUP_X = 0.55;
const GROUP_Y = -0.05;
const GROUP_Z = -0.35;
// Captures are 1600×1000 — cards keep the 1.6:1.0 ratio in world units.
const CARD_W = 1.6;
const CARD_H = 1.0;
// Shard-grid density per tier; low renders the whole card as a single quad.
const SHARD_DIMS: Record<Tier, { readonly cols: number; readonly rows: number }> = {
  high: { cols: 24, rows: 14 },
  med: { cols: 18, rows: 10 },
  low: { cols: 1, rows: 1 },
};
// #0a1420 — the hero material's base color, so cards read as scene furniture
// while the capture loads instead of flashing white.
const PLACEHOLDER_RGBA = [10, 20, 32, 255] as const;
// Dissolve amplitude per tier. Low renders one 1×1 "shard": full-strength
// scatter would fling the entire card, so it gets a gentle push + the alpha
// fade carries the transition (reads as a crossfade).
const SCATTER_SCALE: Record<Tier, number> = { high: 1.0, med: 1.0, low: 0.15 };

// Grid encoding choice: aGrid carries RAW (col, row) indices; cols/rows arrive
// via the uGrid uniform. One attribute then drives both shard placement and UV
// windowing (shardUV = (uv + aGrid) / uGrid) with no baked normalization.
const PORTAL_VERT = /* glsl */ `
uniform vec2 uGrid;         // (cols, rows)
uniform vec2 uCard;         // card size in world units (1.6, 1.0)
uniform float uProgress;    // explodeEnvelope(ringPose.t) — the dissolve driver
uniform float uScatterScale; // tier gate: 1.0 high/med, 0.15 low (gentle push+fade)
attribute vec2 aGrid;
attribute vec3 aOffset;
attribute float aRand;
varying vec2 vShardUv;
varying float vAlpha;

void main() {
  // Window this shard's UVs into its (col, row) cell of the full capture.
  vShardUv = (uv + aGrid) / uGrid;
  // Staggered departure: each shard's effective progress runs at 0.7–1.3× the
  // card's uProgress. Slow shards (low aRand) linger near their grid slot while
  // fast ones are already gone — the lingerers ARE the mid-transition skeleton.
  // Deterministic (aRand is a baked attribute): scrubbing back rewinds exactly.
  float prog = clamp(uProgress * (0.7 + 0.6 * aRand), 0.0, 1.0);
  // Per-shard yaw jitter: spin the quad's local XY around the shard center —
  // plain sin/cos, no matrices, zero per-frame CPU writes. Gated by
  // uScatterScale so the low tier's single quad tips gently instead of
  // slewing the whole card (up to ±1.2 rad reads as a fling at 1×1).
  float ang = uProgress * (aRand - 0.5) * 2.4 * uScatterScale;
  float sa = sin(ang);
  float ca = cos(ang);
  vec2 spun = vec2(position.x * ca - position.y * sa, position.x * sa + position.y * ca);
  // Place the cell-sized quad at its grid slot, centered on the card origin.
  vec2 cell = uCard / uGrid;
  vec3 pos = vec3(spun, position.z) + vec3((aGrid + 0.5) * cell - 0.5 * uCard, 0.0);
  // Displacement drive = prog² (perceptual gamma): aOffset spans ±1.5 world
  // ≈ a full card width, so even 4% LINEAR progress would separate every
  // shard by more than a shard — the assembled read would exist only in a
  // razor-thin scrub band. Squaring keeps cards readable-whole near the
  // settled ends while preserving the full mid-flight fling (disp(1) = 1).
  float disp = prog * prog;
  // Scatter: aOffset is tangent-biased (x ±1.5, y ±0.6, z ±0.4 — portal.ts).
  vec3 scatter = aOffset * disp;
  // Row-shear bias: every shard in a row shares this x term, so rows shear as
  // intact horizontal slices and mid-transition reads as a sliced column
  // ("eksplozija sa kosturom"), not confetti. 1.1 = total shear span in world
  // units from top row to bottom row at full shatter (~2/3 card width — wide
  // enough to read as slices, narrow enough that rows stay visually related).
  scatter.x += (aGrid.y / uGrid.y - 0.5) * 1.1 * disp;
  pos += scatter * uScatterScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  // Shards dim as they scatter but never vanish mid-flight (floor 0.15) —
  // debris stays readable as it bridges outgoing → incoming card.
  vAlpha = 1.0 - prog * 0.85;
}
`;

const PORTAL_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vShardUv;
varying float vAlpha;

void main() {
  vec4 tex = texture2D(uMap, vShardUv);
  gl_FragColor = vec4(tex.rgb, vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface CardResources {
  readonly slug: string;
  readonly geometry: PlaneGeometry;
  readonly material: ShaderMaterial;
  readonly placeholder: DataTexture;
  readonly capture: Texture;
  readonly count: number;
}

function makePlaceholder(): DataTexture {
  const tex = new DataTexture(new Uint8Array(PLACEHOLDER_RGBA), 1, 1);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Case-study captures as shard-grid cards on a scroll-scrubbed ring (S4).
 * The shard dissolve is live: mid-transition the outgoing card shears into a
 * sliced column of debris while the incoming card assembles from the same
 * envelope (explodeEnvelope is symmetric in t, so both are shattered mid-way
 * and whole at rest — the debris bridges the swap). Everything is a pure
 * function of uProgress, assigned per frame: scrubbing up rewinds exactly.
 * Mounted OUTSIDE Hero's scrollGroup so the recede-dolly/sway never move the
 * portals.
 */
export function CasePortals({ tier }: { tier: Tier }) {
  const groupRef = useRef<Group>(null);
  const meshRefs = useRef<(InstancedMesh | null)[]>([]);

  const cards = useMemo<readonly CardResources[]>(() => {
    const { cols, rows } = SHARD_DIMS[tier];
    const count = cols * rows;
    const loader = new TextureLoader();
    return site.cases.map((c, i) => {
      const geometry = new PlaneGeometry(CARD_W / cols, CARD_H / rows);
      const grid = new Float32Array(count * 2);
      for (let s = 0; s < count; s++) {
        grid[s * 2] = s % cols;
        grid[s * 2 + 1] = Math.floor(s / cols);
      }
      geometry.setAttribute("aGrid", new InstancedBufferAttribute(grid, 2));
      // seed = card index — stable across sessions (content order), no Math.random.
      const { offsets, rands } = shardScatterAttrs(cols, rows, i);
      geometry.setAttribute("aOffset", new InstancedBufferAttribute(offsets, 3));
      geometry.setAttribute("aRand", new InstancedBufferAttribute(rands, 1));

      const placeholder = makePlaceholder();
      const material = new ShaderMaterial({
        uniforms: {
          uMap: { value: placeholder },
          uProgress: { value: 0 },
          uGrid: { value: new Vector2(cols, rows) },
          uCard: { value: new Vector2(CARD_W, CARD_H) },
          uScatterScale: { value: SCATTER_SCALE[tier] },
        },
        vertexShader: PORTAL_VERT,
        fragmentShader: PORTAL_FRAG,
        side: DoubleSide,
        // CONSTANT transparency for the shard alpha fade: toggling `transparent`
        // mid-scrub would bump material.version → full program recompile hitch
        // (same discipline as Hero's iridescence note). depthWrite off so dimmed
        // shards don't punch holes in each other; the scene behind is dark, so
        // settled cards (vAlpha = 1.0) still read fully opaque and crisp.
        transparent: true,
        depthWrite: false,
      });
      // Texture fills async; swap uMap only once pixels exist (placeholder holds
      // until then). No useLoader — it suspends and the repo has no Suspense.
      const capture = loader.load(c.capture, (t) => {
        material.uniforms.uMap.value = t;
      });
      capture.colorSpace = SRGBColorSpace;
      if (tier !== "low") capture.anisotropy = 4; // tilted cards; skip on weakest GPUs
      return { slug: c.slug, geometry, material, placeholder, capture, count };
    });
  }, [tier]);

  useEffect(
    () => () => {
      for (const card of cards) {
        card.geometry.dispose();
        card.material.dispose();
        card.placeholder.dispose();
        card.capture.dispose();
      }
    },
    [cards],
  );

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const workP = scrollSignals.workP;
    // Portals exist only inside the /03 scroll window (workP saturates at 0/1
    // outside it, which would otherwise leave a settled card on screen).
    g.visible = workP > 0.001 && workP < 0.999;
    if (!g.visible) return;
    const n = cards.length;
    for (let i = 0; i < n; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const pose = ringPose(workP, n, i);
      // Ring placement — every component ASSIGNED per frame, never accumulated
      // (scrub up rewinds exactly). Sign choice: +cos puts the yaw-0 (active)
      // card on the camera side of the ring (world z ≈ GROUP_Z + radius), so
      // the settled card is nearest the camera; rotation.y = yaw faces each
      // card radially outward — straight at the camera when yaw is 0.
      mesh.position.x = Math.sin(pose.yaw) * PORTAL_RING.radius;
      mesh.position.y = 0;
      mesh.position.z = Math.cos(pose.yaw) * PORTAL_RING.radius;
      mesh.rotation.x = 0;
      mesh.rotation.y = pose.yaw;
      mesh.rotation.z = PORTAL_RING.tiltZ;
      // Dissolve driver: ringPose.t is identical for every card at a given
      // workP, so outgoing AND incoming shatter together mid-transition and
      // both settle whole at t's saw-wrap (envelope 0 at both ends).
      cards[i].material.uniforms.uProgress.value = explodeEnvelope(pose.t);
    }
  });

  return (
    <group ref={groupRef} position={[GROUP_X, GROUP_Y, GROUP_Z]} visible={false}>
      {cards.map((card, i) => (
        <instancedMesh
          key={card.slug}
          args={[card.geometry, card.material, card.count]}
          // instanceMatrix starts zeroed, but the shader never reads it — shards
          // place themselves from aGrid. Culling would use that zeroed matrix.
          frustumCulled={false}
          ref={(m: InstancedMesh | null) => {
            meshRefs.current[i] = m;
          }}
        />
      ))}
    </group>
  );
}
