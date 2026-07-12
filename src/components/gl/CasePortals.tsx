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
import { cardRel, PORTAL_RING, ringPose, shardScatterAttrs } from "@/lib/portal";
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
// Flight-displacement amplitude per tier. Low renders one 1×1 "shard": full-
// strength spine flight would fling the entire card, so it gets a gentle push
// while the alpha curve carries the transition (reads as a sliding crossfade).
// The shader also derives its smear/tumble/dust gate from this value — low
// (0.15) lands below the smoothstep(0.5, 1.0) window, so those terms vanish
// without a dedicated uniform.
const SCATTER_SCALE: Record<Tier, number> = { high: 1.0, med: 1.0, low: 0.15 };

// Grid encoding choice: aGrid carries RAW (col, row) indices; cols/rows arrive
// via the uGrid uniform. One attribute then drives both shard placement and UV
// windowing (shardUV = (uv + aGrid) / uGrid) with no baked normalization.
const PORTAL_VERT = /* glsl */ `
uniform vec2 uGrid;         // (cols, rows)
uniform vec2 uCard;         // card size in world units (1.6, 1.0)
uniform float uRel;         // cardRel(workP, n, i) — signed peel phase: (0,1] departing, [-1,0) arriving
uniform float uScatterScale; // tier gate: 1.0 high/med, 0.15 low (gentle push + crossfade)
attribute vec2 aGrid;
attribute vec3 aOffset;
attribute float aRand;
varying vec2 vShardUv;
varying vec2 vChipUv;
varying float vAlpha;
varying float vProg;

void main() {
  // Window this shard's UVs into its (col, row) cell of the full capture.
  vShardUv = (uv + aGrid) / uGrid;
  // Raw plane uv: the fragment's dust-mote mask needs a per-chip 0..1 frame.
  vChipUv = uv;
  // D = dissolve amount; edge = inner-edge sign in card-local x. The
  // departing card (uRel > 0) exits screen-left, so its inner edge — the
  // side facing the between-cards gap where the dust spine lives — is +x;
  // the arriving card mirrors to -x. step() not sign(): sign(0.0) is 0.0
  // and would collapse the spine target to the card center; at uRel = 0,
  // D = 0 zeroes every peel term, so edge's value there is moot.
  float D = abs(uRel);
  float edge = 2.0 * step(0.0, uRel) - 1.0;
  // Column-ordered wavefront: colPhase 0 = first column to peel (inner
  // edge), 1 = last. Departing peels right-to-left (1-nx); arriving runs
  // the same front backwards as D shrinks, so its far edge solidifies
  // first and the inner edge condenses last. The low tier's single column
  // pins to 0.5 so its whole-card "peel" runs mid-window.
  float nx = aGrid.x / max(uGrid.x - 1.0, 1.0);
  float colPhase = (uGrid.x < 1.5) ? 0.5 : mix(nx, 1.0 - nx, step(0.0, uRel));
  // BAND = traveling-front width in colPhase units (tunable 0.25-0.45):
  // 0.28 keeps only a narrow band of columns mid-peel at any D (the reel's
  // read — the rest of the card stays whole; 0.35 bridged too many columns
  // across the gap at once). The D*(1+BAND) span makes D=0 → all settled
  // and D=1 → all dust exact.
  const float BAND = 0.28;
  float shardProg = clamp((D * (1.0 + BAND) - colPhase) / BAND, 0.0, 1.0);
  // Perceptual gamma on flight: linear progress separates chips almost
  // immediately; squaring keeps chips near their slot as the front arrives
  // while preserving the full displacement at shardProg = 1.
  float flight = shardProg * shardProg;
  // Tier gate derived from the existing uniform (no new uniform): low
  // (0.15) → 0, med/high (1.0) → 1. Low keeps the alpha curve, rounded
  // corners and dark backs but drops smear/tumble/shrink/stretch — the
  // single full-card quad reads as a sliding crossfade, not a warp.
  float g = smoothstep(0.5, 1.0, uScatterScale);
  // Settled slot center of this chip in card-local space.
  vec2 cell = uCard / uGrid;
  vec2 slot = (aGrid + 0.5) * cell - 0.5 * uCard;
  // THE spine: peeled chips converge on a narrow vertical x-band just past
  // the inner edge — 0.5*uCard.x is the edge itself, +0.30 clears the gap
  // so the column floats between cards, +0.35*aRand keeps the band a band,
  // not a line. They spread vertically past the card (aOffset.y spans
  // ±0.6, ×1.1 → ±0.66 ≈ beyond the 1.0 card height), rise as dust
  // (0.7·flight² — quadratic so lift accelerates late and reads as dust
  // buoyancy, not launch), and jitter in depth (aOffset.z ×0.35 damped so
  // the spine stays a column, not a cloud).
  float targetX = edge * (0.5 * uCard.x + 0.30 + 0.35 * aRand);
  vec3 disp = vec3(
    (targetX - slot.x) * flight,
    aOffset.y * 1.1 * flight + 0.7 * flight * flight * (0.3 + aRand),
    aOffset.z * 0.35 * flight
  );
  // Chip shrink toward dust: chips end at 0.55× so the spine reads as
  // motes, not tiles. Gated on low so the full-card quad never scale-pulses.
  vec2 local = position.xy * (1.0 - 0.45 * shardProg * g);
  // Whole-card smear — the reel's headline read: the not-yet-peeled part
  // stretches horizontally while the card slides. sin(π·D) pins smear to
  // exactly 1 at both settled ends (tiling stays seamless); (1 - shardProg)
  // exempts chips already in flight; 0.9 gain ≈ 1.9× peak width — the
  // overlap between neighbour columns IS the cheap motion-blur echo (2.2
  // garbled the capture's text into mush even at D = 0.1 in screenshots).
  local.x *= 1.0 + 0.9 * sin(3.14159 * D) * (1.0 - shardProg) * g;
  // In-flight velocity stretch: chips streak along their flight direction
  // mid-flight. sin(π·shardProg) is exactly 0 at both ends, so settled
  // chips and landed dust stay unstretched; 0.7 gain ≈ 1.7× peak
  // elongation (1.4 streaked the mostly-horizontal flights so wide the
  // spine read as a debris field). Degenerate-direction guard: near-zero displacement →
  // step() zeroes the stretch and max() keeps the divide away from ~0.
  float speed = length(disp.xy);
  vec2 fdir = disp.xy / max(speed, 1e-3) * step(1e-3, speed);
  local += fdir * dot(local, fdir) * (0.7 * sin(3.14159 * shardProg) * g);
  // Hard tumble about the local X (row) axis inside the spine: the row-
  // coherent sin term (0.9 rad/row ≈ 7-row period) keeps neighbours
  // tumbling in related directions; 1.6 rad row span + 1.0 rad jitter
  // deliberately flips many chips past 90° — the fragment's dark card-back
  // slate makes those flashes read physical, like the reel's tumbling
  // debris. Gated on low so the whole card never somersaults.
  float tumble = shardProg * (1.6 * sin(aGrid.y * 0.9 + 0.6) + 1.0 * (aRand - 0.5)) * g;
  float st = sin(tumble);
  float ct = cos(tumble);
  // position.z is 0 on PlaneGeometry, so the X-rotation reduces to
  // (x, y·cos, y·sin) — no matrix needed.
  vec3 chip = vec3(local.x, local.y * ct, local.y * st);
  // SETTLED-STATE PURITY (uRel = 0): D = 0 → shardProg = 0 → flight = 0 →
  // disp = (0,0,0); smear = 1 + 2.2·sin(0)·… = 1; shrink = 1 - 0 = 1;
  // stretch adds fdir·(…)·sin(0) = 0; tumble = 0 → chip = position.xy;
  // vAlpha = (1 - 0)·(1 - smoothstep(0.72, 1, 0)) = 1; vProg = 0 disables
  // the fragment dust mask. The card is its exact untransformed,
  // seamlessly tiled capture (plus the rounded-corner mask).
  vec3 pos = vec3(chip.xy + slot, chip.z) + disp * uScatterScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  // Chips dim in flight (0.22 floor keeps the spine readable), then the
  // whole dust cloud dissipates across the last 28% of the phase — a fully
  // departed card is INVISIBLE. This is what makes the peel directional:
  // the outgoing card never reassembles, it fades out as dust.
  vAlpha = (1.0 - 0.78 * shardProg) * (1.0 - smoothstep(0.72, 1.0, D));
  vProg = shardProg;
}
`;

const PORTAL_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uCard;
uniform float uScatterScale;
varying vec2 vShardUv;
varying vec2 vChipUv;
varying float vAlpha;
varying float vProg;

void main() {
  vec4 tex = texture2D(uMap, vShardUv);
  // Back faces (chips tumbled past 90°, and whole cards the ring carries
  // past profile) render as a dark card-back slate instead of a mirrored
  // texture. vec3(0.039, 0.078, 0.125) = #0a1420, the scene's base color.
  // Full 1.0 mix: partial mixes left readable mirrored text on the low
  // tier's full-card quad (screenshot-verified at 2× zoom). A uniform dark
  // panel IS the physical card-back read; the per-chip alpha fade keeps
  // backs from flattening into one mass.
  float backness = gl_FrontFacing ? 0.0 : 1.0;
  vec3 col = mix(tex.rgb, vec3(0.039, 0.078, 0.125), backness);
  // Rounded corners (reel parity, all tiers): rounded-rect SDF in card
  // space over the FULL-card uv, so the mask tiles seamlessly across the
  // shard grid. 0.05 world corner radius ≈ the reel's rounding at this
  // card size; 0.008 feather ≈ 1px at the settled framing — soft enough
  // not to alias, tight enough to stay crisp.
  vec2 p = (vShardUv - 0.5) * uCard;
  vec2 q = abs(p) - (0.5 * uCard - vec2(0.05));
  float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.05;
  float alpha = vAlpha * (1.0 - smoothstep(0.0, 0.008, sdf));
  // Dust softening: in-flight chips melt their square silhouette into a
  // round mote — radial mask over the chip's own 0..1 uv, solid inside
  // r 0.15, gone past 0.65. ×0.85 keeps a hint of the square so motes
  // still catch texture. vProg-gated: settled chips (vProg = 0) are
  // EXACTLY mask-free, so the tiled card stays seamless. The tier gate
  // (same smoothstep as the vertex stage) kills it on low, where a
  // full-card round mote would read as a vignette.
  float dustGate = smoothstep(0.5, 1.0, uScatterScale);
  alpha *= mix(1.0, 1.0 - smoothstep(0.15, 0.65, length(vChipUv - 0.5)), vProg * 0.85 * dustGate);
  gl_FragColor = vec4(col, alpha);
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
 * Case-study captures as shard-grid cards on a scroll-scrubbed ring (S4),
 * transitioning via a DIRECTIONAL PEEL (reel parity — activetheory.net/work):
 * the departing card stays whole and horizontally smeared while a traveling
 * wavefront peels it column-by-column from its inner edge; peeled chips
 * tumble into a narrow vertical dust spine between the cards, rise, shrink
 * and soften into round motes, then the whole cloud fades — the outgoing
 * card NEVER reassembles. The arriving card runs the same math in reverse
 * (condenses from dust, far edge solidifying first). Driven per card by the
 * signed uRel = cardRel(workP, n, i), assigned per frame from pure
 * functions: scrubbing up rewinds the peel exactly. Mounted OUTSIDE Hero's
 * scrollGroup so the recede-dolly/sway never move the portals.
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
          uRel: { value: 0 },
          uGrid: { value: new Vector2(cols, rows) },
          uCard: { value: new Vector2(CARD_W, CARD_H) },
          uScatterScale: { value: SCATTER_SCALE[tier] },
        },
        vertexShader: PORTAL_VERT,
        fragmentShader: PORTAL_FRAG,
        side: DoubleSide,
        // CONSTANT transparency for the peel alpha fade: toggling `transparent`
        // mid-scrub would bump material.version → full program recompile hitch
        // (same discipline as Hero's iridescence note). depthWrite off so dimmed
        // chips don't punch holes in each other; the scene behind is dark, so
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
      // the settled card is nearest the camera.
      mesh.position.x = Math.sin(pose.yaw) * PORTAL_RING.radius;
      mesh.position.y = 0;
      mesh.position.z = Math.cos(pose.yaw) * PORTAL_RING.radius;
      mesh.rotation.x = 0;
      // Rotation cap ×0.45 (reel parity): cards keep facing mostly
      // camera-ward while they slide. Full ring yaw put the mid-scrub card
      // edge-on to the camera — a dead zone where both cards collapsed into
      // lines; 0.45 keeps enough turn to sell the ring without ever going
      // profile. Position math stays on the full yaw, so the slide path is
      // unchanged.
      mesh.rotation.y = pose.yaw * 0.45;
      mesh.rotation.z = PORTAL_RING.tiltZ;
      // Peel driver: signed per-card phase. Departing (rel > 0) peels
      // inner-edge-first into the dust spine and never reassembles (the
      // cloud fades near |rel| = 1); arriving (rel < 0) condenses in
      // reverse, far edge first. Pure function of workP — scrub-safe.
      cards[i].material.uniforms.uRel.value = cardRel(workP, n, i);
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
