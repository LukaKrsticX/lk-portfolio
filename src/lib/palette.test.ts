import { describe, expect, it } from "vitest";
import { blendAt, measureKeypoints, type SectionRect } from "./keypoints";
import { PALETTE_REST, PALETTE_ROWS_FOR_TEST, paletteAt, SECTION_ORDER } from "./palette";

// A synthetic six-section layout (evenly spaced, 1000px tall each on a 6000px page) → anchors
// at p = offsetTop / maxScroll. Mirrors the keypoints test fixtures.
const VH = 800;
function sixSections(): ReturnType<typeof measureKeypoints> {
  const rects: SectionRect[] = SECTION_ORDER.map((id, i) => ({
    id,
    offsetTop: i * 1000,
    offsetHeight: 1000,
  }));
  const maxScroll = 6000 - VH;
  return measureKeypoints(rects, maxScroll, VH);
}

describe("paletteAt", () => {
  it("returns rest for an empty blend (pre-measure NaN safety)", () => {
    const kf = paletteAt({ from: "", to: "", t: 0 });
    expect(kf).toEqual(PALETTE_REST);
  });

  it("hits the exact keyframe at every section anchor centre (t=0 on the segment start)", () => {
    const kp = sixSections();
    for (const id of SECTION_ORDER) {
      const anchor = kp.anchors.find((a) => a.id === id)!;
      const blend = blendAt(kp, anchor.p);
      // At an anchor blendAt yields t=0 with from=this section → paletteAt === that row exactly.
      expect(blend.from).toBe(id);
      expect(blend.t).toBe(0);
      expect(paletteAt(blend)).toEqual(PALETTE_ROWS_FOR_TEST[id]);
    }
  });

  it("is continuous across the whole scroll range (no channel jumps at joins)", () => {
    const kp = sixSections();
    const channels = (kf: ReturnType<typeof paletteAt>): number[] => [
      ...kf.bgTop,
      ...kf.bgBottom,
      ...kf.tint,
      kf.contrast,
      kf.emissive,
    ];
    let prev = channels(paletteAt(blendAt(kp, 0)));
    // Fine sweep; the largest single-step delta must stay small (smoothstep windows are C1).
    for (let s = 1; s <= 1000; s++) {
      const p = s / 1000;
      const cur = channels(paletteAt(blendAt(kp, p)));
      for (let c = 0; c < cur.length; c++) {
        expect(Math.abs(cur[c] - prev[c])).toBeLessThan(0.02);
      }
      prev = cur;
    }
  });

  it("bounds every lerped channel within the min/max of its two endpoints (no overshoot)", () => {
    const kp = sixSections();
    for (let s = 0; s <= 200; s++) {
      const p = s / 200;
      const b = blendAt(kp, p);
      const kf = paletteAt(b);
      const from = PALETTE_ROWS_FOR_TEST[b.from as (typeof SECTION_ORDER)[number]] ?? PALETTE_REST;
      const to = PALETTE_ROWS_FOR_TEST[b.to as (typeof SECTION_ORDER)[number]] ?? from;
      const within = (v: number, a: number, c: number): boolean =>
        v >= Math.min(a, c) - 1e-9 && v <= Math.max(a, c) + 1e-9;
      expect(within(kf.contrast, from.contrast, to.contrast)).toBe(true);
      expect(within(kf.emissive, from.emissive, to.emissive)).toBe(true);
      for (let c = 0; c < 3; c++) {
        expect(within(kf.tint[c], from.tint[c], to.tint[c])).toBe(true);
        expect(within(kf.bgTop[c], from.bgTop[c], to.bgTop[c])).toBe(true);
      }
    }
  });

  it("comp-variant independence: paletteAt is a pure fn of the blend (no axis/global state)", () => {
    const kp = sixSections();
    // Same blend twice, and interleaved with other-p calls, must return identical values —
    // the palette never consults debugChoice('axis') or any mutable module state.
    const b = blendAt(kp, 0.42);
    const first = paletteAt(b);
    paletteAt(blendAt(kp, 0.1));
    paletteAt(blendAt(kp, 0.9));
    const second = paletteAt(b);
    expect(second).toEqual(first);
  });

  it("hero is the flat-accent rest (equal gradient endpoints → today's background exactly)", () => {
    expect(PALETTE_REST.bgTop).toEqual(PALETTE_REST.bgBottom);
    expect(PALETTE_REST.tint).toEqual([1, 1, 1]);
    expect(PALETTE_REST.contrast).toBe(1);
    expect(PALETTE_REST.emissive).toBe(0);
  });
});
