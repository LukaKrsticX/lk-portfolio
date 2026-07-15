// Pure helpers for the work-card raycast hook (use-card-raycast). Kept in lib so the
// interactive-DOM guard and the hover easing are unit-testable without a live renderer.
import { alphaEff } from "./virtual-scroll";

/**
 * Elements that own the pointer over the GL cards: any real DOM control the cursor is on
 * must win, so the card raycast (and the click→portal gesture) skips while over one.
 */
// [tabindex]:not([tabindex="-1"]): sections use tabIndex={-1} as an a11y focus target
// (Sections.tsx) — programmatically focusable but NOT interactive; a bare [tabindex]
// matched them and permanently suppressed card hover/click across the whole section.
export const INTERACTIVE_SELECTOR =
  'a,button,input,textarea,select,[role=button],[tabindex]:not([tabindex="-1"])';

/** True when `el` (or an ancestor) is an interactive control — the card layer yields to it. */
export function isInteractiveTarget(el: Element | null): boolean {
  return el !== null && el.closest(INTERACTIVE_SELECTOR) !== null;
}

/** Per-card hover scalar eased toward the hit state (α 0.08), framerate-normalized. */
export const HOVER_ALPHA = 0.08;
export function hoverStep(current: number, hit: boolean, dt: number): number {
  return current + ((hit ? 1 : 0) - current) * alphaEff(HOVER_ALPHA, dt);
}
