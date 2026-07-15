import { describe, expect, it } from "vitest";
import {
  CARD_MARGIN,
  createCardTrigger,
  createPortalTrigger,
  createSectionTrigger,
  SECTION_MARGIN_P,
} from "./burst-triggers";
import { measureKeypoints, type SectionRect } from "./keypoints";

// Three sections at p ≈ 0, 0.5, 1.0 (offsetTop 0, 500, 1000 over maxScroll 1000).
const RECTS: SectionRect[] = [
  { id: "hero", offsetTop: 0, offsetHeight: 500 },
  { id: "work", offsetTop: 500, offsetHeight: 500 },
  { id: "contact", offsetTop: 1000, offsetHeight: 200 },
];
const KP = measureKeypoints(RECTS, 1000, 800);
// anchors: hero p=0, work p=0.5, contact p=1.0

describe("createSectionTrigger", () => {
  it("primes silently: the very first update never fires", () => {
    const t = createSectionTrigger();
    expect(t.update(KP, 0)).toBe(false);
  });

  it("fires once when p clears an anchor by the margin, moving forward", () => {
    const t = createSectionTrigger();
    t.update(KP, 0); // prime at hero
    expect(t.update(KP, 0.5)).toBe(false); // exactly at the work anchor — inside the dead band
    expect(t.update(KP, 0.5 + SECTION_MARGIN_P + 0.001)).toBe(true); // cleared → fire
    expect(t.update(KP, 0.6)).toBe(false); // no re-fire while still inside work
  });

  it("does NOT double-fire on jitter around an anchor (the whole point of the dead band)", () => {
    const t = createSectionTrigger();
    t.update(KP, 0.49); // prime just below work
    let fires = 0;
    // oscillate ±0.005 (< margin) across the p=0.5 boundary many times
    for (let i = 0; i < 50; i++) {
      if (t.update(KP, 0.5 + (i % 2 === 0 ? 0.005 : -0.005))) fires++;
    }
    expect(fires).toBe(0); // jitter never clears the band → never fires
  });

  it("fires backward too, and only after clearing the band downward", () => {
    const t = createSectionTrigger();
    t.update(KP, 0.7); // prime inside work
    expect(t.update(KP, 0.5 - 0.005)).toBe(false); // just below the work anchor — still in band
    expect(t.update(KP, 0.5 - SECTION_MARGIN_P - 0.001)).toBe(true); // cleared downward → fire
  });

  it("empty keypoints never fire (NaN-free before mount)", () => {
    const t = createSectionTrigger();
    const empty = measureKeypoints([], 1, 1);
    expect(t.update(empty, 0)).toBe(false);
    expect(t.update(empty, 0.5)).toBe(false);
  });
});

describe("createCardTrigger", () => {
  it("primes silently and fires once per card arrival (N=2)", () => {
    const t = createCardTrigger();
    expect(t.update(0, 2)).toBe(false); // prime at card 0
    expect(t.update(0.4, 2)).toBe(false); // still card 0's basin
    expect(t.update(0.5 + CARD_MARGIN + 0.01, 2)).toBe(true); // crossed into card 1
    expect(t.update(1.0, 2)).toBe(false); // no re-fire at card 1
  });

  it("does not double-fire on jitter at the ½ boundary (N=2)", () => {
    const t = createCardTrigger();
    t.update(0.4, 2); // prime near card 0
    let fires = 0;
    for (let i = 0; i < 40; i++) fires += t.update(0.5 + (i % 2 === 0 ? 0.01 : -0.01), 2) ? 1 : 0;
    expect(fires).toBe(0);
  });

  it("is N-generic: fires on each arrival across N=5", () => {
    const t = createCardTrigger();
    t.update(0, 5); // prime at card 0
    let fires = 0;
    // sweep 0→1 in fine steps; each integer card centre should register exactly one arrival
    for (let p = 0; p <= 1.0001; p += 0.001) fires += t.update(p, 5) ? 1 : 0;
    expect(fires).toBe(4); // cards 1,2,3,4 arrive (0 was the prime)
  });

  it("pins outside the work window (clamped workP → no spurious fires)", () => {
    const t = createCardTrigger();
    t.update(0, 2);
    // workP < 0 and > 1 both clamp; never advances the index
    expect(t.update(-0.5, 2)).toBe(false);
    expect(t.update(0, 2)).toBe(false);
  });

  it("N≤0 never fires (degenerate case guarded)", () => {
    const t = createCardTrigger();
    expect(t.update(0.5, 0)).toBe(false);
    expect(t.update(0.5, 1)).toBe(false); // single card → cardProgress pinned at 0
  });
});

describe("createPortalTrigger", () => {
  it("fires only on the rising edge (closed→open)", () => {
    const t = createPortalTrigger();
    expect(t.update(false)).toBe(false);
    expect(t.update(true)).toBe(true); // rising edge
    expect(t.update(true)).toBe(false); // held open — no re-fire
    expect(t.update(false)).toBe(false); // closing
    expect(t.update(true)).toBe(true); // re-open fires again
  });
});
