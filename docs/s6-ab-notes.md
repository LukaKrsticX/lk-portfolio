# S6 "Helix Feel" — Operator A/B + Tuning Notes

Written at the end of Phase 6 (2026-07-15) for the operator's Vercel-preview review of the
`s6-helix-feel` branch. Every feature is gated by a `?flag=0` URL param (existing convention:
absence/anything-but-`0` = ON) or an `?axis=` A/B choice. Append to the preview URL, e.g.
`…vercel.app/?post=0&tier=med`. All flags stack.

Budget at hand-off: **446.6 KB gz** total JS (incl. the lazy GL chunk); CI limit set to **458 KB**
(`scripts/check-budget.mjs`, formula in-file). Test suite: **317 passing / 35 files**.

---

## 1. Flag matrix — what each toggle isolates, and what to compare

| Flag | ON (default) | `=0` (or variant) | Compare / look for |
|---|---|---|---|
| `?scroll=0` | Virtual scroll (cascade + velocity bus, `overflow:hidden`, DOM transform) | **Native** scroll, byte-for-byte pre-S6 | The safety hatch. Native leg must feel/behave exactly like `main`. Reduced-motion & coarse-pointer force this automatically. |
| `?axis=morph` | Full parametric helix morph + compositional keyframes (**default**) | — | The recommended axis. |
| `?axis=comp` | — | Morph uniforms pinned at rest; only composition (drift/tilt/scale) + palette light run | A/B control: is the *shape* morph worth it, or does composition-only read as well? Same lighting either way. |
| `?work=0` | Helix-mounted GL work cards + hover + title echo | GL cards gone; DOM `#work` list unchanged | Card hover physics, echo on flick, the rail dive. DOM parity underneath. |
| `?portal=0` | Click card → case portal (wipe + dialog + velocity exit) | Cards are plain external-link DOM only | Portal choreography; a11y dialog. `=0` must equal today's link cards. |
| `?fx=0` | Analytic particles (ambient / confetti bursts / streaks) | No particle mesh | Confetti on section/card/portal events; comet streaks on flick; clean round sprites at rest. |
| `?fluid=0` | Med+ mouse-fluid trail RT (feeds particle drift + post chromatic edges) | Fluid RT off; particles + post still run | Fluid smear on cursor; the composite's chromatic edge boost. Low tier never has fluid (keeps `RippleBackground`). |
| `?post=0` | **Med+** tier-gated post chain (bloom + grain + chromatic + palette grade + vignette) | Direct render, today's path bit-exact | The filmic layer. `=0` (or low tier / demote) must show no black frame, no double-render — auto-render resumes cleanly. |
| `?decode=0` | Digit-scramble section h2s + case titles on enter | Static text, no observer | The decode animation. `=0` and reduced-motion render plain text (still accessible). |
| `?tier=low\|med\|high` | Auto-detected | Forced tier (soak bisection) | Post/particles/fluid all tier-gate off this. `low` = no post, no fluid, 2048 particles. |
| `?choreo=0` | Axis morph + spin + camera choreography | Axis frozen at rest pose, no spin/camera motion | The motion control. **Note:** palette *lighting* (bg gradient, axis emissive, post grade) still scrubs with `p` under `?choreo=0` — the freeze is geometry/camera, not light. |
| `?ripple=0`, `?irid=0` | Pointer-ripple trail / helix iridescence | Off | Pre-S6 soak toggles, unchanged. |

### Recommended review passes
1. **Post on/off, med tier:** `/?tier=med` vs `/?tier=med&post=0` — filmic layer sanity (grain must whisper, chromatic subpixel at idle, bloom a glow not a wash).
2. **Axis A/B:** `/?axis=morph` vs `/?axis=comp` — is the shape morph earning its budget?
3. **Demote path:** load `/?tier=med`, then in devtools throttle to force a PerformanceMonitor decline → PostChain must unmount and auto-render resume live (no frozen/black frame).
4. **Decode + reduced-motion:** OS reduce-motion ON → titles must be static and readable; OFF → scramble on first section enter (once per load).
5. **Portal close scroll restore (M2):** scroll to a work card, open it, close via Esc/×/velocity → you must land back at the **exact** pre-open scroll position (not bumped up to `#work` near the top). Browser-Back close intentionally keeps the anchor behavior.

---

## 2. Post chain (P6) — `src/components/gl/PostChain.tsx`

Hand-rolled, no `postprocessing` dep. Mounts ONLY when tier is med/high **and** `?post≠0`
(`src/components/gl/Scene.tsx` gates the mount). When mounted it takes over rendering via a
priority-1 `useFrame` (R3F auto-render disabled — it calls `gl.render` itself: scene→HDR RT→tent
bloom→composite). Colour: three renders the scene to a linear-HDR RT (`NoToneMapping` for non-null
targets), bloom/grade run in linear, and the composite-to-screen applies ACESFilmic + sRGB via the
`<tonemapping_fragment>`/`<colorspace_fragment>` chunk includes — matching the pre-post look.

| Knob | File:line | Value | Effect |
|---|---|---|---|
| `BLOOM_INTENSITY` | PostChain.tsx:125 | 0.55 | Multiplies `pow(bloom,1.8)`. ↑ = more glow. |
| `GRAIN` | PostChain.tsx:126 | 0.03 | Film-grain amplitude (±0.015 linear, whisper after ACES). |
| `SHIFT_BASE` | PostChain.tsx:128 | 0.0009 | Idle chromatic split (uv). Keep sub-pixel. |
| `SHIFT_VEL` | PostChain.tsx:129 | 0.0016 | Extra split × `|velSm|` (0..1) on flick. |
| `SHIFT_FLUID` | PostChain.tsx:130 | 0.02 | Extra split × `length(fluid.xy)` at trail edges (med+). |
| `VIGNETTE` | PostChain.tsx:131 | 0.16 | Corner darkening. |
| `MIPS_FOR` | PostChain.tsx:132 | high 4 / med 3 | Bloom mip count (softness/cost). Base mip = 0.3×DPR. **This is a global GLOW dial, not just cost — each mip step ≈ 2.5× scene luminance** (high 5→4 measured: work 0.396→0.160 meanY, contact 0.066→0.033). |

## 3. Palette / lighting scrub (P6) — `src/lib/palette.ts`

Single source of scene light (spec §7 "same geometry, different light"). Per-section keyframes
lerped by `blendAt(p)`; consumed by `RippleBackground` (bg gradient), `HelixRibbon` (axis emissive),
`PostChain` (tint/contrast). **Independent of `?axis`.** Hero uses equal gradient stops = today's
flat accent, so `p=0` background is byte-exact.

| Knob | File:line | Notes |
|---|---|---|
| `PALETTE_REST` (hero) | palette.ts:39 | Neutral: flat accent bg, tint [1,1,1], contrast 1, emissive 0. Editing this shifts the whole rest look. |
| `PALETTE_ROWS` | palette.ts:51 | Per-section `{bgTop,bgBottom,tint,contrast,emissive}`. Work has the cyan emissive lift (0.16). |
| `ACCENT` | palette.ts:36 | The `#4da6e8` base both hero stops share. |
| Axis emissive apply | HelixRibbon.tsx:143 | `emissive = tint·emissive` (value-only write, no recompile). |
| Bg gradient apply | RippleBackground.tsx (useFrame) | `mix(bgBottom,bgTop,vUv.y)`. |

## 4. Decode text (P6) — `src/lib/decode.ts` + `src/components/dom/DecodeText.tsx`

Digits-only scramble resolving left-to-right (p² clean head) at 15fps, on first section-enter
(IntersectionObserver, once per load). Real text in `aria-label`, scramble in an `aria-hidden` span
— the enclosing heading takes its name from the label, so SR reads the real title throughout.

| Knob | File:line | Value |
|---|---|---|
| Duration | decode.ts:18 | `clamp(2·len+50, 500, 1500)` ms |
| `FRAME_MS` | decode.ts:10 | 1000/15 (repaint cadence) |
| `STAGGER_MS` | decode.ts:13 | 300 (case titles cascade by index) |
| Clean-head curve | decode.ts:38 | `⌈p²·len⌉` |
| Charset | decode.ts:8 | `"0123456789"` |

---

## 5. Earlier-phase tuning knobs (for the full-page feel pass)

| Area | File:line | Key constants |
|---|---|---|
| Cascade feel | virtual-scroll.ts:26–32 | `WHEEL_MULT 0.25`, `INERTIA_DECAY 0.9`, `INERTIA_INJECT 0.2055` (≈2.2× flick travel) |
| Helix axis | HelixRibbon.tsx:20–24 | `HELIX_SCRUB 2.5π`, `ENERGY_BOOST 1.5`, `BEND_AMP 0.35` (velocity bow) |
| Helix keyframes | helix-morph.ts (`MORPH_ROWS`) | per-section radius/turns/pitch/width/tilt/drift |
| Camera rig | CameraRig.tsx:28–36 | per-section `{pos,look,fov,moveXY}`; hero locked `[0,0,3.6]`/fov 42 |
| Work rail/cards | workrail.ts:19–25 | `CARD_RADIUS 1.15`, `CARD_ANGLE_STEP −50°`, `ROT_CAP 0.45` |
| Card material | HelixCards.tsx:41,70,90 | `SMEAR_K 0.016`, `BRAND` accent, base brightness `mix(0.45,0.7,uHover)` (work-scoped — free for other sections), mid-hover flash `sin(π·uHover)·0.3` |
| Card hover | card-raycast.ts:21 | `HOVER_ALPHA 0.08` |
| Title echo | CardTitle.tsx:30–43 | 15 ghost columns, drag `0.15·uEcho`, split `mix(0.001,0.02)` @120° |
| Portal choreo | portal-tween.ts:14–19 | `CAM_MS 700`, `WIPE_MS 1500`, `DOLLY_MS 1500`, `CLOSE_MS 800`, `EXIT_THRESHOLD 1200` px/s |
| Particles | particles.ts:16,22,27–31 | `POOL_SIZE` 16384/8192/2048, `BURST_EXPIRY 2.5`, `BURST_DRAG 2.2`, `BURST_GRAVITY 3.5`, `BURST_SPEED 2.4` |
| Fluid sim | use-fluid-sim.ts:35–39 | `DISSIPATION 0.98`, `CURL 30`, `SPLAT_RADIUS 0.0016`, `SPLAT_FORCE 6` |

All feel constants live in these lib tables / shader-constant blocks — tune values, no structural
edits. After changing any, re-run `pnpm test && pnpm lint && pnpm build && pnpm budget`.
