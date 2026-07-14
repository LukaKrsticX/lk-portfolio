import { describe, expect, it } from "vitest";
import { blendAt, type Keypoints, measureKeypoints, type SectionRect, sectionAt } from "./keypoints";

// Six stacked sections, maxScroll 5000, vh 1000 — anchor p = offsetTop / maxScroll.
const SECTIONS: readonly SectionRect[] = [
  { id: "hero", offsetTop: 0, offsetHeight: 1000 },
  { id: "services", offsetTop: 1000, offsetHeight: 800 },
  { id: "work", offsetTop: 1800, offsetHeight: 1500 },
  { id: "process", offsetTop: 3300, offsetHeight: 700 },
  { id: "about", offsetTop: 4000, offsetHeight: 900 },
  { id: "contact", offsetTop: 4900, offsetHeight: 1000 },
];
const MAX = 5000;
const VH = 1000;
const kp = (): Keypoints => measureKeypoints(SECTIONS, MAX, VH);

describe("measureKeypoints", () => {
  it("maps offsetTop → normalized anchor p, in section order", () => {
    const { anchors } = kp();
    expect(anchors.map((a) => a.id)).toEqual(["hero", "services", "work", "process", "about", "contact"]);
    expect(anchors[0].p).toBeCloseTo(0);
    expect(anchors[1].p).toBeCloseTo(0.2);
    expect(anchors[2].p).toBeCloseTo(0.36);
    expect(anchors[5].p).toBeCloseTo(0.98);
  });
  it("reports a visibility span (pStart from bottom-enter, pEnd from top-exit), clamped [0,1]", () => {
    const { anchors } = kp();
    expect(anchors[0].pStart).toBe(0); // (0 - 1000)/5000 clamps to 0
    expect(anchors[0].pEnd).toBeCloseTo(0.2);
    expect(anchors[2].pStart).toBeCloseTo(0.16); // (1800-1000)/5000
    expect(anchors[2].pEnd).toBeCloseTo(0.66); // (1800+1500)/5000
    for (const a of anchors) {
      expect(a.pStart).toBeGreaterThanOrEqual(0);
      expect(a.pEnd).toBeLessThanOrEqual(1);
    }
  });
  it("anchor p is monotonic non-decreasing", () => {
    const { anchors } = kp();
    for (let i = 1; i < anchors.length; i++) expect(anchors[i].p).toBeGreaterThanOrEqual(anchors[i - 1].p);
  });
  it("is idempotent — same inputs give a deep-equal result", () => {
    expect(measureKeypoints(SECTIONS, MAX, VH)).toEqual(measureKeypoints(SECTIONS, MAX, VH));
  });
  it("skips a missing middle section without NaN and keeps order", () => {
    const missing = SECTIONS.filter((s) => s.id !== "process");
    const { anchors } = measureKeypoints(missing, MAX, VH);
    expect(anchors.map((a) => a.id)).toEqual(["hero", "services", "work", "about", "contact"]);
    for (const a of anchors) expect(Number.isNaN(a.p)).toBe(false);
  });
  it("floors maxScroll at 1 (degenerate) without NaN or division blowup", () => {
    const { anchors } = measureKeypoints(SECTIONS, 0, VH);
    for (const a of anchors) {
      expect(Number.isFinite(a.p)).toBe(true);
      expect(a.p).toBeLessThanOrEqual(1);
      expect(a.p).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("blendAt", () => {
  it("holds section 0 before the first anchor (t=0)", () => {
    expect(blendAt(kp(), 0)).toEqual({ from: "hero", to: "hero", t: 0 });
    expect(blendAt(kp(), -1)).toEqual({ from: "hero", to: "hero", t: 0 });
  });
  it("holds the last section past the last anchor (t=0)", () => {
    expect(blendAt(kp(), 1)).toEqual({ from: "contact", to: "contact", t: 0 });
    expect(blendAt(kp(), 2)).toEqual({ from: "contact", to: "contact", t: 0 });
  });
  it("picks the adjacent pair and an eased t inside a segment", () => {
    const b = blendAt(kp(), 0.1); // midway hero(0) → services(0.2)
    expect(b.from).toBe("hero");
    expect(b.to).toBe("services");
    expect(b.t).toBeCloseTo(0.5); // smoothstep(0.5) === 0.5
  });
  it("t reaches exactly 0 at the left anchor of each segment", () => {
    const b = blendAt(kp(), 0.2); // exactly services anchor → next segment, t 0
    expect(b.from).toBe("services");
    expect(b.to).toBe("work");
    expect(b.t).toBe(0);
  });
  it("is continuous across the whole [0,1] (no jump as from/to shift at anchors)", () => {
    const k = kp();
    const ids = k.anchors.map((a) => a.id);
    // Numeric probe: map each section to its index, interpolate via blendAt — a jump
    // at an anchor would show up as a step in this monotone-ish trace.
    const value = (p: number): number => {
      const b = blendAt(k, p);
      const fi = ids.indexOf(b.from);
      const ti = ids.indexOf(b.to);
      return fi + (ti - fi) * b.t;
    };
    let prev = value(0);
    for (let s = 1; s <= 1000; s++) {
      const cur = value(s / 1000);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });
  it("empty keypoints degrade to an empty blend without throwing", () => {
    const empty = measureKeypoints([], MAX, VH);
    expect(blendAt(empty, 0.5)).toEqual({ from: "", to: "", t: 0 });
  });
});

describe("sectionAt", () => {
  it("returns the last section whose anchor p has been passed", () => {
    const k = kp();
    expect(sectionAt(k, 0)).toBe("hero");
    expect(sectionAt(k, 0.19)).toBe("hero"); // still before services (0.2)
    expect(sectionAt(k, 0.2)).toBe("services"); // boundary flips at the anchor
    expect(sectionAt(k, 0.99)).toBe("contact");
  });
  it("boundaries sit exactly at anchor p", () => {
    const k = kp();
    for (let i = 1; i < k.anchors.length; i++) {
      const p = k.anchors[i].p;
      expect(sectionAt(k, p - 1e-9)).toBe(k.anchors[i - 1].id);
      expect(sectionAt(k, p)).toBe(k.anchors[i].id);
    }
  });
});
