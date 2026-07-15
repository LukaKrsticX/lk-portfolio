// Burst edge-detectors — pure, no three. Three sources fire a confetti burst (Particles.tsx wires
// them in its single-writer frame): a section crossing (sectionAt), a card arrival (round of
// cardProgress), and a portal open. Each is a hysteretic edge detector: a naked id/rounding change
// would double-fire when the scroll cascade jitters p around an anchor or a card centre, so every
// detector carries a Schmitt-style dead band and only fires once the new state is cleared by a
// margin. Deterministic and side-effect-free — Particles owns the "where" (burst origin), these
// own the "when".

import type { Keypoints } from "./keypoints";
import { cardProgress } from "./workrail";

/** p must clear a section anchor by this much before the crossing commits (dead band ±this on p). */
export const SECTION_MARGIN_P = 0.015;
/** cardProgress must sit this far past the ½ boundary before a card arrival commits. */
export const CARD_MARGIN = 0.12;

export interface SectionTrigger {
  /** Returns true on the frame a NEW section is committed (fire a burst); primes silently first call. */
  update(kp: Keypoints, p: number): boolean;
}

export interface CardTrigger {
  /** Returns true on the frame a NEW nearest-card index is committed; primes silently first call. */
  update(workP: number, n: number): boolean;
}

export interface PortalTrigger {
  /** Returns true on the rising edge (closed→open) of the portal. */
  update(active: boolean): boolean;
}

/** Raw nearest-anchor index for p (last anchor whose p ≤ current) — the un-hystereased section. */
function rawSectionIndex(kp: Keypoints, p: number): number {
  const a = kp.anchors;
  let i = 0;
  for (let k = 0; k < a.length; k++) if (a[k].p <= p) i = k;
  return i;
}

/**
 * Section-crossing detector with a Schmitt dead band of ±`marginP` around each anchor. Forward
 * (p rising) commits the new section only once p has cleared the target anchor by the margin;
 * backward (p falling) commits only once p has dropped below the committed anchor by the margin.
 * Inside the band the committed section is frozen, so cascade jitter at a boundary fires nothing.
 */
export function createSectionTrigger(marginP: number = SECTION_MARGIN_P): SectionTrigger {
  let committed = -1;
  return {
    update(kp, p) {
      const a = kp.anchors;
      if (a.length === 0) return false;
      const raw = rawSectionIndex(kp, p);
      if (committed < 0) {
        committed = raw; // prime — no burst on the first observation (page load / remount)
        return false;
      }
      if (raw > committed) {
        // moving forward: fire once p is clearly past the newly-entered anchor
        if (p >= a[raw].p + marginP) {
          committed = raw;
          return true;
        }
      } else if (raw < committed) {
        // moving backward: fire once p has dropped clearly below the anchor we're leaving
        if (p <= a[committed].p - marginP) {
          committed = raw;
          return true;
        }
      }
      return false;
    },
  };
}

/**
 * Card-arrival detector: fires when the nearest card index (round of cardProgress) changes, with a
 * dead band of `margin` past the ½ boundary so jitter at a card midpoint fires once, not repeatedly.
 * cardProgress clamps workP to [0,1], so outside the work window the index pins and nothing fires.
 */
export function createCardTrigger(margin: number = CARD_MARGIN): CardTrigger {
  let committed = -1;
  return {
    update(workP, n) {
      if (n <= 0) return false;
      const f = cardProgress(workP, n); // 0 .. n−1
      const raw = Math.round(f);
      if (committed < 0) {
        committed = raw;
        return false;
      }
      if (raw !== committed && Math.abs(f - committed) > 0.5 + margin) {
        committed = raw;
        return true;
      }
      return false;
    },
  };
}

/** Portal-open detector: rising edge of `active` (false→true). Boolean, so no jitter band needed. */
export function createPortalTrigger(): PortalTrigger {
  let prev = false;
  return {
    update(active) {
      const fire = active && !prev;
      prev = active;
      return fire;
    },
  };
}
