import { describe, expect, it } from "vitest";
import { buildHelixTable, HELIX_REST, HELIX_TILT_REST, morphAt, SECTION_ORDER } from "./helix-morph";

describe("HELIX_REST", () => {
  it("equals today's baked constants so the comp variant reads as today", () => {
    expect(HELIX_REST.radius).toBe(0.25);
    expect(HELIX_REST.turns).toBe(2.25);
    expect(HELIX_REST.width).toBe(0.2);
    expect(HELIX_REST.pitch).toBe(1);
    expect(HELIX_REST.tiltZ).toBe(HELIX_TILT_REST);
    expect(HELIX_REST.tiltZ).toBe(-0.42);
    expect(HELIX_REST.drift).toEqual([1.45, 0.1, -0.7]);
    expect(HELIX_REST.scale).toBe(1);
  });
});

describe("buildHelixTable", () => {
  it("covers every section in both variants", () => {
    for (const variant of ["morph", "comp"] as const) {
      const table = buildHelixTable(variant);
      for (const id of SECTION_ORDER) expect(table[id]).toBeDefined();
    }
  });
  it("morph.hero is exactly the rest keyframe (p=0 continuity with today)", () => {
    expect(buildHelixTable("morph").hero).toEqual(HELIX_REST);
    expect(buildHelixTable("comp").hero).toEqual(HELIX_REST);
  });
  it("morph opens the shape per D3 (services braid tight, work rail open, contact tower)", () => {
    const t = buildHelixTable("morph");
    expect(t.services.radius).toBe(0.19);
    expect(t.services.turns).toBe(3);
    expect(t.work.radius).toBe(0.9);
    expect(t.work.turns).toBe(1.2);
    expect(t.work.pitch).toBe(1.35);
    expect(t.contact.tiltZ).toBe(-1.25); // near-vertical tower gesture
  });
  it("comp pins morph fields (radius/turns/pitch/width) to rest but keeps compositional keyframes", () => {
    const t = buildHelixTable("comp");
    for (const id of SECTION_ORDER) {
      expect(t[id].radius).toBe(HELIX_REST.radius);
      expect(t[id].turns).toBe(HELIX_REST.turns);
      expect(t[id].pitch).toBe(HELIX_REST.pitch);
      expect(t[id].width).toBe(HELIX_REST.width);
    }
    // compositional fields still move (contact tilt is the control's tell)
    expect(t.contact.tiltZ).toBe(-1.25);
    expect(t.work.drift).toEqual(buildHelixTable("morph").work.drift);
  });
});

describe("morphAt", () => {
  const table = buildHelixTable("morph");

  it("returns the exact keyframe when from === to (settled on a section)", () => {
    expect(morphAt(table, { from: "work", to: "work", t: 0.5 })).toEqual(table.work);
  });
  it("lerps every field by t", () => {
    const mid = morphAt(table, { from: "hero", to: "services", t: 0.5 });
    expect(mid.radius).toBeCloseTo((0.25 + 0.19) / 2);
    expect(mid.turns).toBeCloseTo((2.25 + 3) / 2);
    expect(mid.drift[0]).toBeCloseTo((1.45 + table.services.drift[0]) / 2);
  });
  it("t=0 yields `from`, t=1 yields `to`", () => {
    expect(morphAt(table, { from: "hero", to: "work", t: 0 })).toEqual(table.hero);
    expect(morphAt(table, { from: "hero", to: "work", t: 1 })).toEqual(table.work);
  });
  it("is continuous in t (no jumps sweeping 0→1)", () => {
    let prev = morphAt(table, { from: "work", to: "contact", t: 0 }).radius;
    for (let s = 1; s <= 100; s++) {
      const cur = morphAt(table, { from: "work", to: "contact", t: s / 100 }).radius;
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });
  it("falls back to rest for an unknown section id (defensive, no NaN)", () => {
    const kf = morphAt(table, { from: "nope", to: "nope", t: 0.5 });
    expect(kf).toEqual(HELIX_REST);
  });
});
