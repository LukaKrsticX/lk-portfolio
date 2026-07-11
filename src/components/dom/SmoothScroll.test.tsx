import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lenisRef, setSceneLive } from "@/lib/scroll";
import { isPlainHashClick, SmoothScroll } from "./SmoothScroll";

const { instances } = vi.hoisted(() => ({ instances: [] as Array<Record<string, unknown>> }));
vi.mock("lenis", () => ({
  default: class MockLenis {
    destroyed = false;
    constructor(public opts: unknown) {
      instances.push(this as unknown as Record<string, unknown>);
    }
    raf() {}
    stop() {}
    start() {}
    scrollTo() {}
    destroy() {
      this.destroyed = true;
    }
  },
}));

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

describe("SmoothScroll gating (freeze-trap)", () => {
  beforeEach(() => stubMatchMedia({}));
  afterEach(() => {
    act(() => setSceneLive(false));
    instances.length = 0;
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("does not construct Lenis before the scene is live", () => {
    render(<SmoothScroll />);
    expect(instances).toHaveLength(0);
  });

  it("constructs while the scene is live and destroys when it dies", () => {
    render(<SmoothScroll />);
    act(() => setSceneLive(true));
    expect(instances).toHaveLength(1);
    act(() => setSceneLive(false));
    expect(instances[0].destroyed).toBe(true);
  });

  it("wires lenisRef for the rAF feed while live and clears it on death (freeze-trap guard)", () => {
    render(<SmoothScroll />);
    act(() => setSceneLive(true));
    expect(lenisRef.current).toBe(instances[0]);
    act(() => setSceneLive(false));
    expect(lenisRef.current).toBeNull();
  });

  it("constructs Lenis with the ONE-rAF-loop / lerp-only invariants (mock-realism pin)", () => {
    render(<SmoothScroll />);
    act(() => setSceneLive(true));
    expect(instances[0].opts).toMatchObject({
      autoRaf: false,
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
    });
  });

  it("never constructs under prefers-reduced-motion", () => {
    stubMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    render(<SmoothScroll />);
    act(() => setSceneLive(true));
    expect(instances).toHaveLength(0);
  });

  it("never constructs on coarse pointers (mobile = native touch)", () => {
    stubMatchMedia({ "(pointer: coarse)": true });
    render(<SmoothScroll />);
    act(() => setSceneLive(true));
    expect(instances).toHaveLength(0);
  });

  it("?scroll=0 disables Lenis entirely", () => {
    window.history.replaceState(null, "", "/?scroll=0");
    render(<SmoothScroll />);
    act(() => setSceneLive(true));
    expect(instances).toHaveLength(0);
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
