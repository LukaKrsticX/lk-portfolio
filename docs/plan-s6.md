# LK Portfolio — S6 "Helix Feel" Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking — tick as you complete, commit per phase.
> **Quota directive (operator, 2026-07-14):** implementation subagents run on **model `opus`** (claude-opus-4-8), **foreground only — never background**. The orchestrating session may be Fable (scarce) or Opus; all heavy lifting goes to opus subagents. If a fresh session picks this up: read the Spec, this plan, and `src/lib/scroll.ts` first, then continue from the first unticked checkbox.
> **Read-truncation hook note:** if the Read tool returns 1-line/truncated content on any file, use Bash `cat` instead; edit via Edit tool normally, and if Edit/Write is blocked, fall back to Python-through-Bash file writes.

**Goal:** Rework the scroll-feel layer per the approved S6 mandate: hybrid virtual scroll world with cascading inertia + velocity bus, helix as the transforming central axis, helix-mounted work cards with hover physics + title echo, click→portal case entry, analytic particles + fluid trail, tier-gated filmic post, digit-decode text, palette-scrubbed lighting.

**Spec:** `C:/Users/L/Desktop/CCX/docs/superpowers/specs/2026-07-14-lk-portfolio-s6-helix-feel-design.md` (decisions D1–D5, constants, budget §9). Study constants: `C:/Users/L/Desktop/CCX/docs/superpowers/2026-07-14-activetheory-scroll-breakdown.md` §4. **Proprietary boundary: no activetheory code/shaders copied — ours only.**

**Branch:** `s6-helix-feel` off `main` (2b0f2d9). Vercel auto-deploys `main` → merge only at operator-reviewed checkpoints. Push branch for preview deploys.

**Baseline (measured 2026-07-14):** 442.4KB gz / 550 limit. Projected end state ≈ 490KB; new CI limit set in P6 by formula `ceil(measured + 0.15×(measured − 442.4) + 10)`, cap 550. Over-budget cut order: fluid sim → variant-B ambitions → echo grazing gate → med-tier post features.

**Per-phase regression gate (run before every phase commit):** `pnpm test && pnpm lint && pnpm build && pnpm budget` all green, plus the phase's own checklist.

**Verification agents:** any "verify as the executor would" review subagent MUST work in an isolated git worktree and prove cleanup (operator standing rule).

---

## Phase 0 — Discovery digest (DONE — findings inlined below)

Completed 2026-07-14. Key facts every phase relies on:

- **Copy-sources:** InstancedMesh + ShaderMaterial + per-frame-assigned uniforms + dispose: `src/components/gl/CasePortals.tsx:326-457`. Window pointer tracking: `src/components/gl/use-pointer-tracker.ts:22-53`. FBO ping-pong sim (useFBO + setRenderTarget + swap): `src/components/gl/use-pointer-ripple.ts:48-119`. Debug flags/choice: `src/lib/debug-flags.ts:9-27`. Scroll store/bridge + gating predicate: `src/lib/scroll.ts:4-55`, `src/components/dom/SmoothScroll.tsx:24,30-53,57-93`, `src/components/gl/RafBridge.tsx:13-22`. Test styles: pure-math invariants `src/lib/portal.test.ts` (continuity/monotonicity/purity), jsdom layout stubs `src/lib/scroll.test.ts:43-119`, component takeover template `src/components/dom/SmoothScroll.test.tsx`, fake timers `src/components/Loader.test.tsx:7-13,44`.
- **Verified APIs (node_modules):** `Material.onBeforeCompile(params, renderer)` — params has `.vertexShader/.fragmentShader: string` + `.uniforms` (`@types/three .../materials/Material.d.ts:588`, `WebGLPrograms.d.ts:21-22,210-211`); `customProgramCacheKey()` (`Material.d.ts:598`). `useFBO(w, h, {type, depthBuffer, samples, ...})` returns WebGLRenderTarget, defaults `HalfFloatType` + Linear filters (`drei core/Fbo.d.ts:7`, compiled `Fbo.js:26-28`); shallow import graph, budget-safe. `HalfFloatType` `three/constants.d.ts:337`. `Raycaster.setFromCamera` + `intersectObjects(objects, recursive?, target?)` (`core/Raycaster.d.ts:162,207`). `MathUtils.damp(x,y,lambda,dt)` (`math/MathUtils.d.ts:56`). `CanvasTexture` (`textures/CanvasTexture.d.ts:33`).
- **⚠ R3F `useFrame(cb, priority)` with priority > 0 DISABLES automatic rendering** (verified in compiled fiber esm lines 1121, 16060) — the P6 PostChain must call `gl.render()` itself; priority ≤ 0 (like the ripple sim's −1) only reorders callbacks.
- **R3F pointer events can never fire** — canvas wrapper is `zIndex:-1` under the DOM (`Scene.tsx:19`, `use-pointer-tracker.ts:16-21`). Card hover/click = manual Raycaster + window listeners + `document.elementFromPoint` guard. Never use `<mesh onClick>` here.
- **`Nav.tsx:14` is `position:sticky`** → `#vs-root` wraps ONLY `<Sections/>` (`page.tsx` renders Experience/Nav/Sections/SmoothScroll as bare siblings). Nav stays outside; in virtual mode body never scrolls so Nav pins at layout position.
- **Lenis removal surface (complete):** `src/lib/scroll.ts:1,13` · `SmoothScroll.tsx:3,55-93` · `RafBridge.tsx:4,16` · `globals.css:25-30` (dead `.lenis*` rules) · `SmoothScroll.test.tsx` (lenis mock) · `agencies/page.tsx:10` (comment) · `package.json`.
- **Cases: exactly 2** (`site.ts:45-75` — holimed, cea; fields per `content/types.ts:1-10`; captures `/cases/*.webp`). All card/rail math must be N-generic but LOOK GOOD at N=2.
- **Material recompile traps:** iridescence crossing 0 (`Hero.tsx:37-45`), `transparent`/`depthWrite` toggles (`CasePortals.tsx:356-363`), env map animation = PMREM rerun (`Hero.tsx:55-64`). Set once at construction, uniforms only at runtime.
- **No Suspense in repo** — textures via `TextureLoader.load(cb)` + 1×1 DataTexture placeholder (`CasePortals.tsx:301-306,366-369`), never `useLoader`.
- **Hero's shared material** (`Hero.tsx:39-52`) feeds BOTH Monogram and HelixRibbon — the helix morph must run on a **clone**, or the monogram deforms too.
- CI: `.github/workflows/ci.yml:11-16` (install → bake-drift guard → test → build → budget); budget script `scripts/check-budget.mjs:5` (`LIMIT_KB`).

---

## Phase 1 — Virtual scroll pipeline + velocity bus (MVP part 1)

### Task 1.1: Pure pipeline math — `src/lib/virtual-scroll.ts` (+ tests first)

**Files:** Create `src/lib/virtual-scroll.ts`, `src/lib/virtual-scroll.test.ts`.

- [x] Write the test file FIRST (style: `portal.test.ts` invariants, explicit `dt` feeding, no fake timers). Cover at minimum:
  - `alphaEff(a, dt) = 1 - (1-a)^(dt*60)`: dt-invariance — stepping 2×(dt/2) ≈ 1×dt within 1e-3 on y after a wheel impulse; `alphaEff(a, 1/60) === a` exactly.
  - Cascade never overshoots: after any impulse sequence, `y` approaches target monotonically once input stops (no oscillation past target).
  - Inertia: single impulse total travel ≈ `GAIN×` raw delta (assert within tolerance of the calibrated constant); inertia decays below 0.01px within 2s.
  - Clamps: y, head, target all within `[0, max]` under negative/overflow impulses; `setMax` re-clamps.
  - `lock()`: wheel input while locked leaves target/y unchanged; `unlock()` resumes.
  - Tween: `tweenTo(x, 800)` reaches exactly `x` at t=800ms (easeInOutCubic), cascade still smooths y behind it; a wheel impulse mid-tween cancels the tween (user wins).
  - Deadband: |head−target| < 0.01 snaps (no infinite micro-lerp).
  - Determinism: same impulse+dt script twice → identical y trace.
- [x] Implement `createVirtualScroll(opts: { max: number })` returning `{ readonly y, readonly vel, applyWheel(deltaPx), step(dtSec), tweenTo(target, ms), setMax(n), lock(), unlock(), isLocked() }`. Internals per spec §3: `target += delta·WHEEL_MULT` (clamped); `inertia = inertia·0.9^(dt·60) + delta·INERTIA_INJECT`; per frame `target += inertia·dt·60` (clamped); `head = lerp(head, target, alphaEff(0.5, dt))` with 0.01px deadband; `y = lerp(y, head, alphaEff(0.1, dt))`. `vel` = (y − prevY)/dt computed in step. Constants exported for tuning: `WHEEL_MULT = 0.25`… calibrate `INERTIA_INJECT` so total flick travel ≈ 2.2× raw delta (document the geometric-sum derivation in a comment: Σ decay^n · dt·60 ≈ 10 at 0.9 → INJECT ≈ (2.2−0.25)/10 ≈ 0.2 — verify in the test, not by faith).
- [x] Pure TS, no DOM/three imports. Every function typed.

### Task 1.2: Store rework — `src/lib/scroll.ts`

- [x] Replace `lenisRef` with `pipelineRef: { current: { frame(tMs: number): void } | null }` (drop the lenis type import — file becomes three-free AND lenis-free). Update `RafBridge.tsx` to `pipelineRef.current?.frame(t)` (keep addEffect timing comment).
- [x] Add `scrollMode = { virtual: false }` store + extend `scrollSignals` with `vel: 0, velN: 0, velSm: 0` (documented: written once per frame by Hero — single-writer discipline, `Hero.tsx:80-99` already computes `vel` for energy; extend there, do not add a second writer).
- [x] `measureScrollMetrics()`: when `scrollMode.virtual`, `maxScroll = max(1, vsRoot.offsetHeight − innerHeight)` (`#vs-root` by id); native branch unchanged. `offsetTop`-based metrics untouched (transform-independent).
- [x] Update `scroll.test.ts` stubs accordingly (add `#vs-root` fixture path for the virtual branch).

### Task 1.3: `VirtualScroll` component (replaces SmoothScroll's Lenis path)

**Files:** rename `src/components/dom/SmoothScroll.tsx` → `VirtualScroll.tsx` (git mv; update import in `src/app/page.tsx`), rewrite `SmoothScroll.test.tsx` → `VirtualScroll.test.tsx`.

- [x] Keep verbatim: the always-on plumbing effect (metrics, `scrollState.y = window.scrollY` on native scroll, RO remeasure — `SmoothScroll.tsx:30-53`), `isPlainHashClick`, the header comment banning fiber imports, and the gating predicate `smooth = sceneLive && !reduced && !coarse && scrollOn`.
- [x] Replace the Lenis effect with the virtual-mode effect under the same predicate:
  - **Takeover:** create pipeline with measured max; seed `y = head = target = window.scrollY`; `window.scrollTo(0, 0)`; `document.documentElement.style.overflow = "hidden"`; `scrollMode.virtual = true`; remeasure. `#vs-root` gets `will-change: transform`.
  - **Frame fn** (registered on `pipelineRef`): compute dt from the addEffect timestamp (clamp 1/30); `pipeline.step(dt)`; `scrollState.y = pipeline.y`; write `translate3d(0, ${-y}px, 0)` to `#vs-root` (cache the element ref; round to 0.01px to avoid layout thrash from string churn).
  - **Inputs:** `wheel` listener `{ passive: false }` + `preventDefault()` → `applyWheel(normalized)` (deltaMode 1 → ×16px, deltaMode 2 → ×innerHeight); `keydown` (skip when target is input/textarea/select or `isContentEditable`): Space/Shift+Space ±0.85·innerHeight, PageDown/Up ±0.85·innerHeight, Home/End → 0/max, ArrowDown/Up ±60px — all via `tweenTo` (long) or direct target nudge (arrows); `focusin` on `#vs-root` → if focused el outside [15%, 85%] viewport band, `tweenTo` to center it; hash-anchor clicks (reuse `isPlainHashClick`) → `tweenTo(el.offsetTop)` + pushState + focus (same UX as today); `popstate` → `tweenTo(hash target)` or 0.
  - **Handback (cleanup):** capture `y`; null `pipelineRef`; restore overflow; `scrollMode.virtual = false`; clear transform; `window.scrollTo(0, y)`. Must be exact-position seamless both directions.
- [x] Remove lenis: `pnpm remove lenis`; delete `globals.css:25-30` `.lenis*` block; fix `agencies/page.tsx:10` comment.
- [x] `VirtualScroll.test.tsx` (template: old SmoothScroll.test.tsx structure, matchMedia stubs, sceneLive latch, `?scroll=0` flag): takeover sets overflow hidden + seeds from scrollY + zeroes window scroll; handback restores position exactly; wheel dispatch moves the transform after frame() ticks; focusin scrolls; predicate gating (reduced/coarse/flag → no takeover); popstate tween. Drive frames by calling `pipelineRef.current!.frame(t)` directly with synthetic timestamps.
- [x] Velocity bus in `Hero.tsx` useFrame: extend the existing vel computation (`:97-99`) to also write `scrollSignals.vel` (px/s), `velN = clamp(vel/2000, −1, 1)`, `velSm += (velN − velSm)·alphaEff(0.05, dt)` (import alphaEff from virtual-scroll). Keep `energy` exactly as is.

### Task 1.4: Phase gate

- [x] Regression gate green (expect budget ↓ ~7-8KB from Lenis removal). Record the measured number here. **Measured (post scroll-leak fix): 438.1KB gz / 550 limit (baseline 442.4 → −4.3KB net; Lenis ~−8KB minus ~+3.7KB pipeline). test 204 pass / 24 files (was 168/23), lint clean, build TS-strict clean. Verifier BLOCKER (native scrollY leaks stacking with the transform) closed via instant zeroing + scroll-pin absorb + hash-aware seeding + docTop absolute targets; MINOR (maxScroll ~30px short) closed via document-space `offsetTop + offsetHeight − innerHeight`.**
- [x] Manual verify (playwright, 2 rounds): cascade 2.20× flick gain + inertia settle; anchor #work err −0.79px; End/Home ±1px with End = true bottom (2789 = native max); Tab-focus into contact form pinned (scrollY 0 across 7 hops, center err ≤0.63px); deep-link /#contact deterministic 3/3 (err 0px, landing matches native 161px); `?scroll=0` and reduced-motion → native untouched; console clean (only pre-existing THREE.Clock deprecation).
- [x] Anti-guards checked: no fiber import in VirtualScroll; single `scrollState.y` writer per mode; Nav stays outside `#vs-root` (wrap ONLY `<Sections/>` in `page.tsx`); no `position:sticky` inside the root (grep). **All clean — see report.**
- [x] Commit `feat(s6): virtual scroll pipeline + velocity bus, lenis retired`.

## Phase 2 — Key points + camera rig + helix parametric morph (MVP part 2)

### Task 2.1: `src/lib/keypoints.ts` (+ tests first)

- [x] Tests: mapping (given section offsets/heights + maxScroll → anchors at expected p), `blendAt` continuity across the whole [0,1] (no jumps; windows meet), `sectionAt` boundaries, degenerate (missing section → skipped without NaN), remeasure idempotence.
- [x] Implement: `measureKeypoints(sections: SectionRect[], maxScroll, vh)` → `Keypoints` (ordered anchors `{id, p, pStart, pEnd}` for hero/services/work/process/about/contact); `blendAt(kp, p)` → `{from, to, t}` (smoothstep over the transition window between adjacent section spans); `sectionAt(kp, p)`. Store instance in `scroll.ts` (`keypointsStore`), populated inside `measureScrollMetrics` (it already reads section elements — extend it to record all six section rects; reset-to-default-first discipline per existing comment style).

### Task 2.2: `src/lib/helix-morph.ts` (+ tests first)

- [x] Keyframe table per section, per variant (`morph` | `comp`): `{radius, turns, pitch, width, tiltZ, drift: [x,y,z], scale, emissive, tint}`. Rest values = today's constants (radius 0.25, turns 2.25, LENGTH 7, WIDTH 0.2, tilt −0.42, drift rest per `HelixRibbon.tsx:14-16`) so `comp` ≡ visual today. Morph rows per spec D3 (hero=rest, services tighter: radius 0.19/turns 3.0, work opens: radius 0.9/turns 1.2/pitch 1.35 as STARTING tuning, about relaxed, contact tower: tilt −1.25 amplified from `helixTiltAt`).
- [x] `morphAt(table, blend)` → lerped uniform/transform set. Tests: comp variant returns rest everywhere except compositional fields; continuity; exact keyframe hit at section centers.

### Task 2.3: HelixRibbon → parametric axis

- [x] Rework `HelixRibbon.tsx`: strips become flat `PlaneGeometry(LENGTH, WIDTH, 256, 1)` (NO baked twist, NO off-axis translate — both move into GLSL). **Clone Hero's material per strand** (`material.clone()`; 2 clones, phase 0/π via `uPhase`); set `customProgramCacheKey` to a shared literal so both strands compile ONE program; wire `onBeforeCompile`: inject uniforms `{uPhase, uRadius, uTurns, uPitch, uWidth, uBendAmp, uVel, uTime}` and replace `#include <begin_vertex>` + `#include <beginnormal_vertex>` with the helix transform — port `twistPlanePositions` math (`helix.ts:25-42`) to GLSL: `u = position.x/LENGTH + 0.5; a = uPhase + u·uTurns·2π; r = (position.y·uWidth_scale + uRadius); transformed = vec3(position.x·uPitch, r·cos(a), r·sin(a))` + velocity bow `transformed.y += uBendAmp·uVel·sin(u·π)`; rotate the normal by the same (cos a, sin a) frame. Keep DoubleSide, iridescence constant-on (clones inherit — verify `iridescence !== 0` stays).
- [x] Per-frame driver (in the ribbon's useFrame, keeping ASSIGN-not-accumulate discipline): read `keypointsStore` + `debugChoice("axis", ["morph","comp"] )` (default morph) → `morphAt` → write uniforms + group drift/tilt/scale. Keep `spinAcc` + `HELIX_SCRUB·p` assignment; keep energy spin boost; `uVel = scrollSignals.velSm`. The old workP portal-yield tent (`HelixRibbon.tsx:64-67`) is DELETED (cards now live on the axis).
- [x] Update/extend `helix.test.ts`: `helixTiltAt` survives (contact keyframe consumes it or table replaces it — if replaced, delete fn + test together); morph table tests live in `helix-morph.test.ts`.

### Task 2.4: `src/components/gl/CameraRig.tsx`

- [x] New component inside Canvas: per-section waypoints `{pos, look, fov, moveXY}` (hero EXACTLY `[0,0,3.6]`/fov 42 — p=0 pixel-parity is a gate); work section: waypoints along the axis rail per card index (from Task 3.1's rail math — for P2, a 2-point placeholder rail across the work span is fine); smoothing `MathUtils.damp` λ≈4 (≈α0.12 at 60fps) for position, fov lerp α0.1 (`camera.updateProjectionMatrix()` only when |Δfov| > 0.01); mouse parallax `moveXY` per section from `usePointerTracker` ndc; wobble: `sin/cos` pair at 0.13/0.17 Hz, amp 0.06, through a SECOND slower lerp α0.025 (two timescales — the hand-held layer); `deltaRotate`: `camera.rotation.z` target `= clamp(velN·0.05, ±0.05)` rad, eased α0.1.
- [x] Retire Hero's fake scrollGroup dolly/sway (`Hero.tsx:101-115` scrollGroup writes) — monogram recede block (`monogramGroup`, heroP-driven) STAYS. Keep the scrollGroup node (harmless) or flatten; pointer-parallax group (`Hero.tsx:118-125`) is superseded by rig moveXY — remove its rotation writes.
- [x] Mount `<CameraRig />` in `Scene.tsx` next to RafBridge.

### Task 2.5: Phase gate

- [x] Regression gate green. Record the measured number here. **Measured: 440.1KB gz / 550 limit (Phase 1 was 438.1KB → +2.0KB for keypoints + helix-morph + CameraRig; parametric rework offsets most of the P2 +9KB estimate). test 222 pass / 25 files (was 204/24: −7 retired helix.test, +14 keypoints, +10 helix-morph, +1 scroll keypointsStore), lint clean, build TS-strict clean. Program-count sanity (code-reasoned, renderer not runnable in jsdom): both strand clones return the same `customProgramCacheKey` literal `"helix-strand-parametric-v1"` → three's `acquireProgram` dedups by cacheKey (usedTimes refcount, three.module.js:7993-8012) → ONE compiled program; `onBeforeCompile` still runs per material (getProgram per-instance programs map, 18185-18216) so each strand keeps its own `uPhase` (0/π). Runtime writes are uniform `.value` ONLY (uRadius/uTurns/uPitch/uWidth/uVel/uTime) — grep confirms ZERO `.transparent=/.iridescence=/.needsUpdate=/.version=/.side=` writes in HelixRibbon/CameraRig/Hero, so no version bumps, no recompiles.**
- [x] Visual (playwright): p=0 rest pose math-proven identical to the baked strand + screenshot parity (dashed monogram edge = pre-existing aliasing, confirmed via ?choreo=0); full sweep hits 4 distinct poses (rest → services tight 0.19/3.0 → work open → contact tower −1.25), 0 console errors/NaN; `?axis=comp` pins rest geometry (composition-only) and `?choreo=0` static control both render; velocity S-bend on 5×900px flicks, settles clean at exact max.
- [x] Perf soak `?tier=med`, 25s continuous scroll: avg/min 60fps every 1s window, no demote; instrumented linkProgram/compileShader constant at 7/14 through load→flicks→soak (even counts + shared cache key ⇒ one strand program, zero runtime recompiles).
- [x] Commit `feat(s6): keypoints + camera rig + parametric helix axis (A/B morph|comp)`.

## Phase 3 — Work section: helix cards + hover + title echo

### Task 3.1: `src/lib/workrail.ts` (+ tests first)

- [ ] Tests: pose continuity in workP; N-generic (test N=2 and N=5); camera waypoint per card faces card; `cardProgress` monotonic, exact integers at card centers; rotation cap honored.
- [ ] Implement: `cardPose(i, N)` → `{position: [x,y,z], rotationY}` on the axis (angular step `−50°·(scaled by N)`, radius 1.15, pitch step along axis; rotation capped ROT_CAP 0.45 — continuity with retired ring); `railWaypoint(workP, N)` → camera pos/quat target along the card sequence (linear index, floor+fract, NO snap — the cascade supplies the settle); `cardProgress(workP, N)`.

### Task 3.2: `src/components/gl/HelixCards.tsx` (replaces CasePortals)

- [ ] New component: per case (N=2) a SINGLE PlaneGeometry(1.6, 1.0) quad + ShaderMaterial. Uniform block set once (transparent: true, depthWrite: false — constant, per trap discipline). Texture pattern copied from `CasePortals.tsx:301-306,366-369` (placeholder + async swap, SRGBColorSpace, anisotropy 4 on med+).
- [ ] Fragment (harvested vocabulary, cite spec D2): rounded-rect SDF corner mask (r 0.05, feather 0.008); 5-tap horizontal directional smear with per-frame `uSmear = k·|velSm|` (settled ⇒ all taps same texel — EXACT purity); dark card-back slate `#0a1420` on back faces; brightness `mix(0.65, 0.9, uHover)`; brand-pool radial lift centered on `uHoverPoint` (card-local uv, slides toward cursor), pool strength `0.3→0.5·uHover`; transient flash `sin(π·uHover)·0.3`.
- [ ] Vertex: hover push `position.z += 0.2·uHover` toward camera (camera-ward = +local z, cards face outward) + subtle breathing `sin(uTime·0.5 + i·1.3)·0.01` (per-card phase constant, their free-stagger idea with OUR values).
- [ ] Mount cards as children of the axis group at `cardPose` positions; gate with `debugFlag("work")` (RENAME from `portals` — update `Hero.tsx:33,131`). `visible` gate on the work window like `CasePortals.tsx:393`.
- [ ] CameraRig: replace the P2 placeholder rail with `railWaypoint` (dive along the axis card-to-card).
- [ ] DELETE `CasePortals.tsx`; in `lib/portal.ts` keep ONLY `mulberry32` → `git mv` the survivor into `src/lib/prng.ts` (+ move its 3 tests), delete the rest + their tests. Grep for dangling imports.

### Task 3.3: Hover/click plumbing — `src/components/gl/use-card-raycast.ts`

- [ ] Manual raycast per frame (copy pointer source pattern; Phase-0 fact: R3F events dead): `Raycaster.setFromCamera(pointer.ndc, camera)` → `intersectObjects(cardMeshes, false, reusedArray)`; guard: skip entirely when `document.elementFromPoint(clientX, clientY)` is interactive (`closest("a,button,input,textarea,select,[role=button],[tabindex]")`) — track clientXY in the pointer tracker (extend `use-pointer-tracker.ts` state; keep passive listeners).
- [ ] Per-card `uHover` eased α 0.08 toward hit state; `uHoverPoint` follows hit uv. `document.body.style.cursor = "pointer"` only while hit && no interactive DOM under cursor (restore on miss/unmount).
- [ ] Window `click` listener with the same guard → for P3, fire `capture("work_card_click", {slug})` + no-op (portal lands P4).
- [ ] Component test for the guard logic where extractable (pure helpers into `lib/`).

### Task 3.4: Title echo — `src/components/gl/CardTitle.tsx`

- [ ] Canvas2D texture per title (`CanvasTexture`, 2× res, mono font matching site, transparent bg, drawn once per mount — no per-frame redraws); plane above/beside each card.
- [ ] Echo shader: `uEcho = |velSm|` smoothed α0.05; ghost columns `fract(uv.x·15)`, per-column offset ∝ uEcho; RGB split `mix(0.001, 0.02, uEcho)` @120°; vertical drag 0.15·uEcho; settled (uEcho→0) ⇒ single clean sample EXACTLY (write the shader so every echo term multiplies by uEcho).
- [ ] Dispose canvases/textures on unmount.

### Task 3.5: Phase gate

- [ ] Regression gate green (CasePortals tests deleted with it; suite still ≥ baseline count via new tests).
- [ ] Visual: cards sit on the axis through the work window; camera rail dives past both; hover grows/brightens/pool-follows; echo doubles titles on hard flick and is pixel-clean at rest (screenshot diff rest vs static); DOM #work column still readable alongside; `?work=0` kills the GL cards only.
- [ ] Budget checkpoint vs projection (P3 est +12KB).
- [ ] Commit `feat(s6): helix-mounted work cards + hover physics + title echo; case-portals peel retired`.

## Phase 4 — Click→portal case entry

### Task 4.1: `src/lib/portal-tween.ts` (+ tests first)

- [ ] Tests: state machine transitions (closed→opening→open→closing→closed); track values at known t (camT(700)=1; wipe bezier at t=0/750/1500 vs reference values of cubic-bezier(.29,.05,.06,.92) — compute expected via the solver itself sanity-pinned to (0)=0,(1)=1, midpoint monotonic); mid-flight close reverses from current value without jump; `exitGesture(accumPxPerSec)` threshold 1200; determinism.
- [ ] Implement: small cubic-bezier y(x) solver (Newton + bisection fallback, ~20 lines, tested); `createPortalMachine()` with `open()/close()/step(dt)` → `{phase, camT, wipeT, dollyT}` (700ms easeOutCubic / 1500ms bezier / 1500ms; close = 800ms reverse of wipe from current point).

### Task 4.2: GL layer — `src/components/gl/PortalLayer.tsx`

- [ ] Fullscreen wipe quad (renderOrder above scene, transparent): OWN fbm (3-octave value noise, ~15 lines GLSL) ring — `radius = 1.5·wipeT ± 0.25·fbm feather`, rim brightness spike ×2 at the edge band, chromatic split 0.005 inside/0.001 outside, backdrop zoom cross 2×↔2×. Behind the ring: case backdrop (full-frame capture texture + fluid-flavored smear + palette tint). Uniforms assigned per frame from the machine — never accumulated.
- [ ] Camera fly-in: while opening/open, CameraRig yields to portal target (camera flies INTO the clicked card along its normal, camT eased) — add a rig override channel `{active, pos, look, fovBoost}` set by the portal, cleared on close.
- [ ] Scroll: `pipeline.lock()` on open; while open, wheel events feed an exit accumulator (px/s window) → `close()` past threshold; `unlock()` when fully closed. `?portal=0` gates the whole feature (flag).

### Task 4.3: DOM layer — `src/components/dom/CaseDialog.tsx`

- [ ] `createPortal` to body: `role="dialog" aria-modal="true"` labelled by case title; focus trap (focus heading on open, Tab cycle, restore focus to the source on close — hand-rolled ~30 lines, no dep); Esc → close; visible close button; case story fields + "Visit live ↗" external link + prev/next (N=2 → the other case). Content from `site.cases` — DOM text over the GL backdrop.
- [ ] History: `pushState('', '', '#case-<slug>')` on open; popstate → close; on load with `#case-x` + GL live → fast-path open (200ms); native/reduced mode: `#case-x` → plain scroll to #work (no dialog — cards there remain external links, unchanged parity).
- [ ] Wire click from Task 3.3 → open. Analytics: `portal_open`/`portal_close` with slug + cause (click/esc/velocity/pop).
- [ ] Component tests: focus trap cycle, Esc, aria wiring, popstate close, reduced-mode never mounts.

### Task 4.4: Phase gate

- [ ] Regression gate green.
- [ ] Manual: full journey — scroll to work, hover, click, portal in (three synced tracks), read dialog, wheel-flick exit, Esc exit, browser Back exit, deep-link `#case-holimed` reload, prev/next. Reduced-motion: links behave as today.
- [ ] Budget checkpoint (P4 est +9KB).
- [ ] Commit `feat(s6): click→portal case entry with fbm wipe, dialog a11y, velocity exit`.

## Phase 5 — Particles + fluid trail

### Task 5.1: `src/lib/particles.ts` (+ tests first)

- [ ] Tests: burst slot ring (4 slots, oldest-evict, expiry 2.5s); analytic burst position closed-form (t=0 at origin, apex sane, drag bounds, deterministic per seed); pool sizing per tier {high 16384, med 8192, low 2048}; trigger hysteresis (no double-fire on jitter).
- [ ] Implement pool spec, seed attribute layout (mulberry32 from `prng.ts`), burst manager `{emit(pos, strength, tNow), uniformsAt(tNow)}` → `vec4[4]` data, and `lib/burst-triggers.ts`: edge detectors for section change (`sectionAt`), card arrival (`round(cardProgress)` change), portal open — with hysteresis.

### Task 5.2: `src/components/gl/Particles.tsx`

- [ ] One InstancedMesh (tiny quad), custom ShaderMaterial: additive blending, depthWrite false, transparent true — constants at construction. Attributes: `aSeed` vec4 (mulberry32). Vertex: ambient = cylindrical drift around the axis (sin/cos hash flow, slow), twinkle 5 rad/s, size attenuation by depth; + Σ 4 burst contributions (analytic ballistic + drag + tumble from `uTime − t0`, closed-form — port the tested TS math to GLSL 1:1); + streak: stretch the quad along screen-space velocity ∝ `|velSm|` (billboard basis from view matrix, elongate one axis); med+ only: `uFluid` sampler nudge (drift += fluid.xy·k). Fragment: soft round sprite (radial falloff), palette from uniforms, alpha modest (bloom in P6 will lift).
- [ ] Gate `debugFlag("fx")`; mount in Hero; wire burst triggers in the single-writer useFrame.

### Task 5.3: Fluid sim (med+ only) — `src/components/gl/use-fluid-sim.ts`

- [ ] Copy the ping-pong skeleton from `use-pointer-ripple.ts:48-119` (useFBO pair HalfFloatType, fullscreen triangle, priority ≤ 0, setRenderTarget→render→restore→swap). Sim texture 256px high / 192px med / null low. Single fused pass: advect by own velocity field, dissipation 0.98, curl-flavored rotation (cheap: rotate sample offset by curl strength 30-flavored constant — pressure-free), splat from pointer (pos + velocity from the tracker, consume-once like `:107`).
- [ ] Output consumed by: Particles drift (5.2), P6 composite warp/chromatic edges. `debugFlag("fluid")` gate. Low tier: hook returns null — existing RippleBackground stays everyone's trail language (untouched).

### Task 5.4: Phase gate

- [ ] Regression gate green.
- [ ] Visual per tier (`?tier=low|med|high`): pool sizes right, low has no fluid/no streak-overkill and RippleBackground intact; confetti on section crossings + card arrival + portal; comet streaks on violent flick; `?fx=0` clean.
- [ ] Perf: 60fps soak at med on the dev machine (Vivobook reference) with particles + fluid on — if under, halve med pool BEFORE touching anything else and note it.
- [ ] Budget checkpoint (P5 est +11KB).
- [ ] Commit `feat(s6): analytic particle pool (ambient/confetti/streaks) + med+ fluid trail`.

## Phase 6 — Post chain + palette scrub + decode text + finalization

### Task 6.1: `src/lib/palette.ts` (+ tests first)

- [ ] Per-section keyframes `{bgTop, bgBottom, tint, contrast, emissive}` lerped via `blendAt` (tests: continuity, exact at centers, comp-variant independence). Wire: RippleBackground bg colors, axis material tint/emissive uniforms (S12 chamber read: same geometry, different light), post tint/contrast (6.2).

### Task 6.2: `src/components/gl/PostChain.tsx`

- [ ] Mounts ONLY med+ && `debugFlag("post")` — low tier NEVER mounts it (auto-render preserved, today's path bit-exact). **When mounted: `useFrame(cb, 1)` takes over rendering (Phase-0 fact — must call `gl.render` itself).**
- [ ] Pipeline: scene → sceneRT (useFBO, HalfFloatType); bloom: threshold-0 downsample chain from 0.3×DPR base (5 mips high / 3 med, 9-tap tent up, half-res each step); final composite to screen: `scene + pow(bloom,1.8)·uBloomIntensity` + film grain 0.15 (hash noise, time-jittered) + RGB shift @120° (base 0.0012 + 0.0001·|vel| + fluid-edge boost via `length(fluid.xy)` where available) + palette tint/contrast + gentle vignette. ACES stays (default output tonemapping happens in our composite — include the tonemapping/colorspace fragments like `CasePortals` frag does).
- [ ] RT resize handling (drei useFBO auto-resizes; verify no leak via renderer.info in dev); context-lost path unchanged.
- [ ] `?post=0` and demote-to-low mid-session unmount cleanly (PerformanceMonitor demote → tier prop change → PostChain unmounts → auto-render resumes; VERIFY this explicitly).

### Task 6.3: Decode text — `src/lib/decode.ts` + `src/components/dom/DecodeText.tsx`

- [ ] `lib/decode.ts` tests first: schedule (duration `clamp(2·len+50, 500, 1500)`), 15fps frame times, clean-head `⌈p²·len⌉` monotonic non-decreasing, digits-only charset, 300ms stagger offsets.
- [ ] Component: wraps section `h2`s + case titles in Sections (`<DecodeText>` around text); real text in `aria-label`, animation in `aria-hidden` span; triggers on first section-enter via IntersectionObserver (works in BOTH scroll modes; re-arm never — once per load per element); `prefers-reduced-motion` or `debugFlag("decode")=0` → render children plain, no observer.
- [ ] Component test: aria contract, reduced-motion inert, fake-timers frame progression (template `Loader.test.tsx`).

### Task 6.4: Final tuning + budget lock + handoff

- [ ] Full-page tuning pass against the reference feel goals (breakdown §5 gaps): cascade weight, echo/streak amplitudes, post subtlety — grain must whisper, chromatic subpixel at idle. Adjust constants only (they live in lib tables — no structural edits).
- [ ] Measure: `pnpm build && pnpm budget` → set `LIMIT_KB` in `scripts/check-budget.mjs` per formula `ceil(measured + 0.15×(measured − 442.4) + 10)` (cap 550) + comment citing this plan; CI stays green at the new limit.
- [ ] Playwright full-scroll screenshot pass (desktop 1440×900 + 390×844) — self-review against `.raw/lk-portfolio-refs/site-capture-2026-07-14/` for feel-language parity (OUR character, not their aesthetics); reduced-motion + `?scroll=0` + no-WebGL passes unchanged vs `main`.
- [ ] Write `docs/s6-ab-notes.md` for the operator: flag matrix (`axis=morph|comp`, `scroll/work/portal/fx/fluid/post/decode=0`, `tier=`), what to compare per flag, tuning-knob tables with file:line.
- [ ] Final commit `feat(s6): tier-gated post chain + palette scrub + decode text; CI budget → <N>KB`; push branch; **do NOT merge to `main`** — operator reviews the Vercel preview and merges (outward-facing deploy = operator's call).

## Verification phase (after P6)

- [ ] Anti-pattern grep sweep: `useLoader|ScrollControls|useScroll\(` (0 hits), `onPointerOver|onClick` on meshes (0 hits), `Math.random` in src/lib+gl (0 hits), `position: sticky` inside vs-root subtree (0), `lenis` (0 hits anywhere), direct `material.transparent =` / `.iridescence =` runtime writes (0).
- [ ] Suite counts: every new lib has a test file; deleted-code tests removed; mutation-teeth spot check (invert one constant in virtual-scroll cascade → a test fails).
- [ ] Cross-mode matrix run: {virtual, native(?scroll=0), reduced-motion, no-WebGL(devtools), tier low/med/high} × {load at top, deep-link #work, deep-link #case-x} — no crash, parity holds.
- [ ] Update CCX ledger: hot.md entry + brief's ledger line via a wiki-safe note (CCX side), spec status → SHIPPED-ON-BRANCH.
