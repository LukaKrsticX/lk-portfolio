import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pipelineRef, scrollMode, scrollState, setSceneLive } from "@/lib/scroll";
import { docTop, isPlainHashClick, VirtualScroll } from "./VirtualScroll";

function stubMatchMedia(matches: Record<string, boolean>): void {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: matches[q] ?? false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Build a #vs-root with a measurable height and set the viewport / native offset. */
function setupDom({ scrollY = 0, rootHeight = 5000 }: { scrollY?: number; rootHeight?: number } = {}): {
  root: HTMLElement;
  scrollTo: ReturnType<typeof vi.fn>;
} {
  const root = document.createElement("div");
  root.id = "vs-root";
  document.body.appendChild(root);
  Object.defineProperty(root, "offsetHeight", { value: rootHeight, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true });
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  return { root, scrollTo };
}

/** Drive N pipeline frames with monotonically increasing 60fps-spaced timestamps. */
function tick(frames: number, startMs = 1000): void {
  for (let i = 0; i < frames; i++) pipelineRef.current?.frame(startMs + i * (1000 / 60));
}

const yFromTransform = (root: HTMLElement): number => {
  const m = root.style.transform.match(/translate3d\(0,\s*(-?[\d.]+)px/);
  return m ? -Number(m[1]) : NaN; // transform is translate3d(0, -y, 0) → recover y
};

describe("VirtualScroll takeover / handback", () => {
  beforeEach(() => stubMatchMedia({}));
  afterEach(() => {
    act(() => setSceneLive(false));
    vi.unstubAllGlobals();
    document.getElementById("vs-root")?.remove();
    document.documentElement.style.overflow = "";
    scrollMode.virtual = false;
    pipelineRef.current = null;
    scrollState.y = 0;
    window.history.replaceState(null, "", "/");
  });

  it("does not enter virtual mode before the scene is live", () => {
    setupDom();
    render(<VirtualScroll />);
    expect(pipelineRef.current).toBeNull();
    expect(scrollMode.virtual).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("takeover freezes the body, zeroes window scroll INSTANTLY, and seeds y from scrollY", () => {
    const { scrollTo } = setupDom({ scrollY: 500 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    expect(scrollMode.virtual).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(pipelineRef.current).not.toBeNull();
    // behavior:"instant" is load-bearing: globals.css sets scroll-behavior:smooth, so a
    // plain scrollTo would ANIMATE the zeroing and race any in-flight native scroll.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    const root = document.getElementById("vs-root")!;
    tick(1); // seeded y0=500 sits still on frame 1 (no impulse)
    expect(scrollState.y).toBe(500);
    expect(yFromTransform(root)).toBe(500);
  });

  it("takeover with a #hash deep link seeds from the hash target's layout position, not scrollY", () => {
    // On-load anchor scroll may still be animating (scroll-behavior:smooth) → scrollY is a
    // race-dependent value. The hash element's offsetTop is the intended destination.
    window.history.replaceState(null, "", "/#contact");
    setupDom({ scrollY: 191 }); // mid-animation garbage value
    const contact = document.createElement("section");
    contact.id = "contact";
    document.getElementById("vs-root")!.appendChild(contact);
    Object.defineProperty(contact, "offsetTop", { value: 2400, configurable: true });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    tick(1);
    expect(scrollState.y).toBe(2400); // seeded at the anchor, not at 191
  });

  it("handback restores the exact scroll position instantly and clears the transform", () => {
    const { scrollTo } = setupDom({ scrollY: 500 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    const root = document.getElementById("vs-root")!;
    tick(2);
    const resting = scrollState.y; // 500 (seeded, undisturbed)
    scrollTo.mockClear();
    act(() => setSceneLive(false));
    expect(scrollTo).toHaveBeenCalledWith({ top: resting, behavior: "instant" });
    expect(document.documentElement.style.overflow).toBe("");
    expect(scrollMode.virtual).toBe(false);
    expect(pipelineRef.current).toBeNull();
    expect(root.style.transform).toBe("");
  });

  it("wheel input advances the transform after frames tick", () => {
    const { root } = setupDom({ scrollY: 0 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    tick(1);
    expect(scrollState.y).toBe(0);
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 400, cancelable: true }));
    tick(30);
    expect(scrollState.y).toBeGreaterThan(0); // pipeline scrolled down
    expect(yFromTransform(root)).toBeGreaterThan(0);
  });

  it("focusin on an off-screen field tweens to its ABSOLUTE centered position (layout-space)", () => {
    setupDom({ scrollY: 0 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    const field = document.createElement("input");
    document.getElementById("vs-root")!.appendChild(field);
    // Visual rect below the 0.85·vh band (vh=1000) → handler must tween; the DESTINATION
    // comes from offsetTop, not the rect: docTop(el) + h/2 − vh/2 = 2000 + 20 − 500 = 1520.
    Object.defineProperty(field, "getBoundingClientRect", {
      value: () => ({ top: 2000, height: 40, bottom: 2040, left: 0, right: 0, width: 0, x: 0, y: 2000, toJSON() {} }),
      configurable: true,
    });
    Object.defineProperty(field, "offsetTop", { value: 2000, configurable: true });
    Object.defineProperty(field, "offsetHeight", { value: 40, configurable: true });
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    tick(200); // 500ms tween + cascade settle
    expect(scrollState.y).toBeCloseTo(1520, 1);
  });

  it("pins a native scroll leak back to 0 instantly and absorbs it into the pipeline", () => {
    // overflow:hidden does not block programmatic/native scrolls — a leak stacks with the
    // transform. The pin listener must zero it and fold it into the virtual target.
    const { scrollTo } = setupDom({ scrollY: 0 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    tick(1);
    expect(scrollState.y).toBe(0);
    scrollTo.mockClear();
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true }); // the leak
    window.dispatchEvent(new Event("scroll"));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true }); // pinned back
    tick(200);
    expect(scrollState.y).toBeCloseTo(300, 1); // leak absorbed — user still ends up there
  });

  it("discards a leak while a focus tween is in flight (absolute destination — no double-apply)", () => {
    // Repro of the Tab-into-contact-form blocker: focus sets an absolute tween AND the
    // browser's native scrollIntoView leaks scrollY. The leak must NOT add on top.
    setupDom({ scrollY: 0 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    const field = document.createElement("input");
    document.getElementById("vs-root")!.appendChild(field);
    Object.defineProperty(field, "getBoundingClientRect", {
      value: () => ({ top: 2000, height: 40, bottom: 2040, left: 0, right: 0, width: 0, x: 0, y: 2000, toJSON() {} }),
      configurable: true,
    });
    Object.defineProperty(field, "offsetTop", { value: 2000, configurable: true });
    Object.defineProperty(field, "offsetHeight", { value: 40, configurable: true });
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); // tween → 1520
    Object.defineProperty(window, "scrollY", { value: 2710, configurable: true }); // native reveal leak
    window.dispatchEvent(new Event("scroll"));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    tick(200);
    expect(scrollState.y).toBeCloseTo(1520, 1); // NOT 1520 + 2710
  });

  it("popstate tweens back toward the top when the hash is empty", () => {
    setupDom({ scrollY: 900 });
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    tick(1);
    expect(scrollState.y).toBe(900);
    window.dispatchEvent(new PopStateEvent("popstate"));
    tick(120);
    expect(scrollState.y).toBeLessThan(900); // eased toward 0
  });
});

describe("VirtualScroll predicate gating", () => {
  afterEach(() => {
    act(() => setSceneLive(false));
    vi.unstubAllGlobals();
    document.getElementById("vs-root")?.remove();
    document.documentElement.style.overflow = "";
    scrollMode.virtual = false;
    pipelineRef.current = null;
    window.history.replaceState(null, "", "/");
  });

  it("never takes over under prefers-reduced-motion", () => {
    stubMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    setupDom();
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    expect(pipelineRef.current).toBeNull();
    expect(scrollMode.virtual).toBe(false);
  });

  it("never takes over on coarse pointers (native touch scroll)", () => {
    stubMatchMedia({ "(pointer: coarse)": true });
    setupDom();
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    expect(pipelineRef.current).toBeNull();
  });

  it("?scroll=0 disables the takeover entirely", () => {
    stubMatchMedia({});
    window.history.replaceState(null, "", "/?scroll=0");
    setupDom();
    render(<VirtualScroll />);
    act(() => setSceneLive(true));
    expect(pipelineRef.current).toBeNull();
    expect(scrollMode.virtual).toBe(false);
  });
});

describe("docTop", () => {
  it("walks the offsetParent chain to a layout-space document top", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    Object.defineProperty(parent, "offsetTop", { value: 100, configurable: true });
    Object.defineProperty(parent, "offsetParent", { value: null, configurable: true });
    Object.defineProperty(child, "offsetTop", { value: 50, configurable: true });
    Object.defineProperty(child, "offsetParent", { value: parent, configurable: true });
    expect(docTop(child)).toBe(150); // 50 + 100 up the chain
    expect(docTop(parent)).toBe(100);
    parent.remove();
  });
});

describe("isPlainHashClick", () => {
  const anchor = (href: string): HTMLAnchorElement => {
    const a = document.createElement("a");
    a.setAttribute("href", href);
    return a;
  };
  const click = (init?: MouseEventInit): MouseEvent => new MouseEvent("click", init);

  it("accepts a plain left click on a hash anchor", () => {
    expect(isPlainHashClick(click(), anchor("#work"))).toBe(true);
  });
  it("rejects null anchors, modified clicks, middle clicks, external hrefs", () => {
    expect(isPlainHashClick(click(), null)).toBe(false);
    expect(isPlainHashClick(click({ ctrlKey: true }), anchor("#work"))).toBe(false);
    expect(isPlainHashClick(click({ metaKey: true }), anchor("#work"))).toBe(false);
    expect(isPlainHashClick(click({ button: 1 }), anchor("#work"))).toBe(false);
    expect(isPlainHashClick(click(), anchor("https://cea.rs"))).toBe(false);
    expect(isPlainHashClick(click(), anchor("mailto:x@y.z"))).toBe(false);
  });
});
