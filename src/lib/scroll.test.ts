import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clamp01, easeInOutSine, smoothstep01, stepEnergy,
  scrollState, scrollMetrics, measureScrollMetrics,
  getSceneLive, setSceneLive, subscribeSceneLive,
} from "./scroll";

describe("easing helpers", () => {
  it("clamp01 clamps", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBeCloseTo(0.4);
    expect(clamp01(2)).toBe(1);
  });
  it("easeInOutSine hits endpoints and midpoint", () => {
    expect(easeInOutSine(0)).toBeCloseTo(0);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(1)).toBeCloseTo(1);
  });
  it("smoothstep01 is 0/1 at ends with ease-in shape", () => {
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(0.5)).toBeCloseTo(0.5);
    expect(smoothstep01(0.1)).toBeLessThan(0.1);
  });
});

describe("stepEnergy", () => {
  it("attacks fast toward a higher target", () => {
    const e = stepEnergy(0, 1, 1 / 60);
    expect(e).toBeGreaterThan(0.15); // dt*12 attack ≈ 0.2 in one frame
  });
  it("decays exponentially toward a lower target", () => {
    const e = stepEnergy(1, 0, 1 / 60);
    expect(e).toBeLessThan(1);
    expect(e).toBeGreaterThan(0.9); // tau 0.45s → slow decay per frame
  });
  it("never overshoots the target", () => {
    expect(stepEnergy(0, 1, 10)).toBeLessThanOrEqual(1);
    expect(stepEnergy(1, 0, 10)).toBeGreaterThanOrEqual(0);
  });
});

describe("measureScrollMetrics", () => {
  beforeEach(() => {
    scrollMetrics.maxScroll = 1;
    scrollMetrics.heroEnd = 1;
  });
  it("floors both metrics at 1 when the document is short/unmeasurable", () => {
    measureScrollMetrics(); // jsdom: zero-height layout, scrollingElement undefined
    expect(scrollMetrics.maxScroll).toBeGreaterThanOrEqual(1);
    expect(scrollMetrics.heroEnd).toBeGreaterThanOrEqual(1);
  });
  it("computes maxScroll from scrollingElement and heroEnd from #hero", () => {
    // jsdom 29 does not implement document.scrollingElement — stub it first
    // (pilot-verified fix: defineProperty on the undefined getter throws otherwise).
    Object.defineProperty(document, "scrollingElement", {
      value: document.documentElement,
      configurable: true,
    });
    const hero = document.createElement("section");
    hero.id = "hero";
    document.body.appendChild(hero);
    Object.defineProperty(document.scrollingElement!, "scrollHeight", { value: 5000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
    Object.defineProperty(hero, "offsetTop", { value: 0, configurable: true });
    Object.defineProperty(hero, "offsetHeight", { value: 900, configurable: true });
    measureScrollMetrics();
    expect(scrollMetrics.maxScroll).toBe(4000);
    expect(scrollMetrics.heroEnd).toBe(900);
    hero.remove();
  });
});

describe("scene-live store", () => {
  it("notifies subscribers once per change and is idempotent", () => {
    const cb = vi.fn();
    const off = subscribeSceneLive(cb);
    setSceneLive(true);
    setSceneLive(true); // no second notify
    expect(getSceneLive()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSceneLive(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("scrollState", () => {
  it("is a plain mutable ref the frame loop can read", () => {
    scrollState.y = 123;
    expect(scrollState.y).toBe(123);
    scrollState.y = 0;
  });
});
