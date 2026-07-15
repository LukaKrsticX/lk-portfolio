// Portal orchestration bus — the single place the GL layer (PortalLayer, CameraRig, use-card-raycast)
// and the DOM layer (CaseDialog) meet. No React, no three: plain module state + a subscriber set
// (both useSyncExternalStore consumers and VirtualScroll's manual lock subscription ride it), the
// choreography machine singleton, and the camera-override channel. Side effects that must fire from
// EITHER layer — scroll lock, history, analytics — live here so a GL click and a DOM deep-link share
// one code path. Mirrors scroll.ts's plain-mutable-store idiom; scroll.ts stays the scroll bus.

import { capture } from "./analytics";
import { debugFlag } from "./debug-flags";
import { createPortalMachine } from "./portal-tween";
import { scrollMode } from "./scroll";
import { site } from "@/content/site";

export type PortalCause = "click" | "esc" | "velocity" | "pop";

export interface PortalTarget {
  /** camera fly-in world position (camera ends INTO the card along its normal) */
  readonly pos: readonly [number, number, number];
  /** fly-in look target (the card center) */
  readonly look: readonly [number, number, number];
  /** additive fov delta applied ×camT (negative = push-in); defaults to DEFAULT_FOV_BOOST */
  readonly fovBoost?: number;
}

/** Fast-open duration for the deep-link `#case-x` reload path (spec §6). */
export const FAST_MS = 200;
const DEFAULT_FOV_BOOST = -6;
// Deep-link (no clicked-card world transform available in the DOM) → a modest straight-in dolly.
// The wipe covers the transition, so the exact framing is not load-bearing here.
const DEFAULT_TARGET: PortalTarget = { pos: [0, 0, 2.2], look: [0, 0, -1], fovBoost: DEFAULT_FOV_BOOST };

/**
 * Camera-override channel — written per frame by PortalLayer (camT from the machine), read per
 * frame by CameraRig, which blends its rail/waypoint result toward `pos/look` by `camT` (single
 * camera writer preserved). `active` is also the scroll-lock signal VirtualScroll subscribes to;
 * it stays true through the whole close animation and clears only at the closing→closed edge.
 */
export const portalRig = {
  active: false,
  camT: 0,
  pos: [0, 0, 3.6] as [number, number, number],
  look: [0, 0, 0] as [number, number, number],
  fovBoost: 0,
};

/** The single choreography machine — stepped by PortalLayer's useFrame (the one stepper). */
export const portalMachine = createPortalMachine();

/** Which case is open — CaseDialog subscribes; slug===null means the dialog is unmounted. */
export interface PortalView {
  readonly index: number;
  readonly slug: string | null;
}
const CLOSED_VIEW: PortalView = { index: -1, slug: null };
let view: PortalView = CLOSED_VIEW;

// True while the current open pushed its own history entry (a click-open); false for a deep-link
// open that inherited the hash. Governs whether close pops the entry or just strips the hash.
let pushedEntry = false;

const subs = new Set<() => void>();
function notify(): void {
  for (const cb of subs) cb();
}

/** Subscribe to any portal change (view or active). Shared by CaseDialog + VirtualScroll's lock. */
export function subscribePortal(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
export function getPortalView(): PortalView {
  return view;
}
/** Stable server/initial snapshot (SSR-safe) — the portal is always closed on first paint. */
export function getPortalServerView(): PortalView {
  return CLOSED_VIEW;
}
/** The scroll-lock signal: true from open through the end of the close animation. */
export function isPortalActive(): boolean {
  return portalRig.active;
}

function setTarget(t: PortalTarget): void {
  portalRig.pos[0] = t.pos[0];
  portalRig.pos[1] = t.pos[1];
  portalRig.pos[2] = t.pos[2];
  portalRig.look[0] = t.look[0];
  portalRig.look[1] = t.look[1];
  portalRig.look[2] = t.look[2];
  portalRig.fovBoost = t.fovBoost ?? DEFAULT_FOV_BOOST;
}

/**
 * Open the portal for case `index`. No-ops unless the feature is enabled (`?portal≠0`) AND the page
 * is in virtual mode (fine-pointer + motion-ok + scene-live) — so reduced-motion/coarse/native and
 * no-WebGL keep the plain DOM external-link cards (parity). Ignored while a portal is already
 * engaged (use `navigatePortal` for prev/next). Locks scroll (via the active flag), pushes the
 * `#case-<slug>` hash, and fires `portal_open`.
 */
export function openPortal(
  index: number,
  cause: PortalCause,
  opts: { target?: PortalTarget; fast?: boolean } = {},
): void {
  if (portalRig.active) return; // one portal at a time
  if (typeof window === "undefined") return;
  if (!debugFlag("portal")) return;
  if (!scrollMode.virtual) return;
  const cases = site.cases;
  if (index < 0 || index >= cases.length) return;
  const slug = cases[index].slug;

  view = { index, slug };
  portalRig.active = true;
  portalRig.camT = 0;
  setTarget(opts.target ?? DEFAULT_TARGET);
  portalMachine.open(opts.fast ? FAST_MS : undefined);

  const hash = `#case-${slug}`;
  pushedEntry = false;
  if (location.hash !== hash) {
    history.pushState(null, "", hash);
    pushedEntry = true;
  }
  capture("portal_open", { slug, cause });
  notify();
}

/**
 * Switch the open portal to a different case (prev/next). Keeps the wipe fully open (no
 * re-animation) — only the backdrop texture (PortalLayer reads `view.index`) and dialog content
 * swap. Uses replaceState so Back from any case closes rather than stepping case-by-case.
 */
export function navigatePortal(index: number): void {
  if (!portalRig.active || typeof window === "undefined") return;
  const cases = site.cases;
  if (index < 0 || index >= cases.length) return;
  const slug = cases[index].slug;
  if (slug === view.slug) return;
  view = { index, slug };
  const hash = `#case-${slug}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  capture("portal_open", { slug, cause: "click" });
  notify();
}

/**
 * Begin closing (800ms reverse). Unmounts the dialog immediately (slug→null, so focus restores at
 * once) while the GL wipe reverses; the scroll stays locked until PortalLayer reports the machine
 * fully closed (finalizePortalClosed). `cause==="pop"` means the browser already navigated, so no
 * history manipulation; otherwise pop our pushed entry (Back-closes) or strip an inherited hash.
 */
export function closePortal(cause: PortalCause): void {
  if (!portalRig.active && portalMachine.phase === "closed") return;
  const slug = view.slug;
  portalMachine.close();
  view = { index: view.index, slug: null };

  if (typeof window !== "undefined") {
    if (cause !== "pop") {
      const hash = `#case-${slug}`;
      if (pushedEntry) {
        pushedEntry = false;
        history.back(); // fires popstate; view is already null so the handler no-ops
      } else if (location.hash === hash) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    } else {
      pushedEntry = false;
    }
  }
  capture("portal_close", { slug, cause });
  notify();
}

/** Called by PortalLayer at the closing→closed edge: drop the camera override + scroll lock. */
export function finalizePortalClosed(): void {
  if (!portalRig.active) return;
  portalRig.active = false;
  portalRig.camT = 0;
  notify();
}

/** Test hook — reset all portal state to closed (module singletons persist across tests otherwise). */
export function resetPortalForTests(): void {
  view = CLOSED_VIEW;
  pushedEntry = false;
  portalRig.active = false;
  portalRig.camT = 0;
  portalMachine.close();
  // drive the machine to closed deterministically
  portalMachine.step(1);
}
