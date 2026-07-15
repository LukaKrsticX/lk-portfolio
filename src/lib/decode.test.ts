import { describe, expect, it } from "vitest";
import {
  cleanHead,
  cleanHeadAt,
  DECODE_CHARSET,
  decodedHead,
  decodeDuration,
  FRAME_MS,
  frameIndex,
  renderDecode,
  STAGGER_MS,
  staggerOffset,
} from "./decode";

describe("decodeDuration", () => {
  it("is clamp(2·len+50, 500, 1500)", () => {
    expect(decodeDuration(10)).toBe(500); // 70 → floor-clamped to 500
    expect(decodeDuration(0)).toBe(500);
    expect(decodeDuration(225)).toBe(500); // 2·225+50 = 500 exactly (the knee)
    expect(decodeDuration(400)).toBe(850); // 2·400+50 = 850, in-range
    expect(decodeDuration(725)).toBe(1500); // 2·725+50 = 1500 exactly (upper knee)
    expect(decodeDuration(5000)).toBe(1500); // ceiling
  });
});

describe("staggerOffset", () => {
  it("is index·300ms", () => {
    expect(staggerOffset(0)).toBe(0);
    expect(staggerOffset(1)).toBe(STAGGER_MS);
    expect(staggerOffset(3)).toBe(900);
  });
});

describe("frameIndex (15fps quantisation)", () => {
  it("holds constant within a frame and steps at the boundary", () => {
    expect(frameIndex(0)).toBe(0);
    expect(frameIndex(FRAME_MS - 0.01)).toBe(0);
    expect(frameIndex(FRAME_MS)).toBe(1);
    expect(frameIndex(FRAME_MS * 2.5)).toBe(2);
    expect(frameIndex(-5)).toBe(0); // negative (pre-start) clamps to frame 0
  });
});

describe("cleanHead (p² growth)", () => {
  it("is 0 at p=0 and len at p=1", () => {
    expect(cleanHead(0, 20)).toBe(0);
    expect(cleanHead(1, 20)).toBe(20);
  });

  it("grows monotonically non-decreasing across the sweep", () => {
    const len = 32;
    let prev = 0;
    for (let s = 0; s <= 1000; s++) {
      const p = s / 1000;
      const h = cleanHead(p, len);
      expect(h).toBeGreaterThanOrEqual(prev);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(len);
      prev = h;
    }
  });

  it("accelerates: half-time reveals a quarter (p² curve, not linear)", () => {
    const len = 100;
    expect(cleanHead(0.5, len)).toBe(25); // ⌈0.25·100⌉
  });

  it("cleanHeadAt tracks the same curve against elapsed time", () => {
    const real = "Selected work"; // len 13 → duration 500
    const dur = decodeDuration(real.length);
    expect(cleanHeadAt(0, real.length)).toBe(0);
    expect(cleanHeadAt(dur, real.length)).toBe(real.length);
    let prev = 0;
    for (let e = 0; e <= dur; e += 5) {
      const h = cleanHeadAt(e, real.length);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });
});

describe("renderDecode", () => {
  const real = "Services";

  it("preserves length and reveals the real string at/after the duration", () => {
    const dur = decodeDuration(real.length);
    expect(renderDecode(real, dur)).toBe(real);
    expect(renderDecode(real, dur + 1000)).toBe(real);
    expect(renderDecode(real, dur / 2)).toHaveLength(real.length);
  });

  it("scrambled (unresolved) positions are digits only", () => {
    const out = renderDecode(real, 10); // very early — most positions unresolved
    const head = decodedHead(10, real.length);
    for (let i = head; i < real.length; i++) {
      expect(DECODE_CHARSET).toContain(out[i]);
    }
  });

  it("resolved head positions match the real text", () => {
    const dur = decodeDuration(real.length);
    const out = renderDecode(real, dur * 0.8);
    const head = decodedHead(dur * 0.8, real.length);
    for (let i = 0; i < head; i++) {
      expect(out[i]).toBe(real[i]);
    }
  });

  it("keeps whitespace unscrambled (word shape stays readable)", () => {
    const spaced = "Selected work";
    const out = renderDecode(spaced, 10);
    expect(out[8]).toBe(" "); // the space between the two words is never a digit
  });

  it("is frame-stable: two elapsed values inside one frame render identically", () => {
    const a = renderDecode(real, FRAME_MS * 3 + 1);
    const b = renderDecode(real, FRAME_MS * 3 + FRAME_MS - 1);
    expect(a).toBe(b);
  });

  it("is deterministic: same (text, elapsed) → same output", () => {
    expect(renderDecode(real, 123)).toBe(renderDecode(real, 123));
  });
});
