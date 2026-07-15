import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeDuration, FRAME_MS } from "@/lib/decode";
import { DecodeText } from "./DecodeText";

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

// Controllable IntersectionObserver: records instances, exposes a manual trigger.
class MockIO {
  static instances: MockIO[] = [];
  cb: IntersectionObserverCallback;
  el: Element | null = null;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    MockIO.instances.push(this);
  }
  observe(el: Element): void {
    this.el = el;
  }
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  enter(): void {
    this.cb([{ isIntersecting: true, target: this.el } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const DIGITS = /[0-9]/;

describe("DecodeText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia({});
    MockIO.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aria contract: real text in aria-label, animation in an aria-hidden span", () => {
    const { container } = render(<DecodeText>Selected work</DecodeText>);
    const outer = container.querySelector("span[aria-label]") as HTMLElement;
    expect(outer).not.toBeNull();
    expect(outer.getAttribute("aria-label")).toBe("Selected work");
    const inner = outer.querySelector("span[aria-hidden]") as HTMLElement;
    expect(inner).not.toBeNull();
    expect(inner.getAttribute("aria-hidden")).toBe("true");
    // Before intersection the visible text is the real text (SSR/first-paint parity).
    expect(inner.textContent).toBe("Selected work");
  });

  it("scrambles on enter then resolves to the real text by the duration", () => {
    const text = "Services";
    const { container } = render(<DecodeText>{text}</DecodeText>);
    const inner = container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(MockIO.instances).toHaveLength(1);

    act(() => {
      MockIO.instances[0].enter();
    });
    // A few frames in: same length, and at least one digit somewhere (mid-scramble).
    act(() => {
      vi.advanceTimersByTime(FRAME_MS * 2);
    });
    expect(inner.textContent).toHaveLength(text.length);
    expect(inner.textContent!).toMatch(DIGITS);

    // Past the duration: fully resolved to the real string.
    act(() => {
      vi.advanceTimersByTime(decodeDuration(text.length) + FRAME_MS * 2);
    });
    expect(inner.textContent).toBe(text);
  });

  it("reduced-motion is inert: no observer, text never scrambles", () => {
    stubMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    const text = "About";
    const { container } = render(<DecodeText>{text}</DecodeText>);
    // Effect ran but took the inert path → no IntersectionObserver constructed.
    expect(MockIO.instances).toHaveLength(0);
    const inner = container.querySelector("span[aria-hidden]") as HTMLElement;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(inner.textContent).toBe(text);
    // aria-label still carries the real name for assistive tech.
    expect((container.querySelector("span[aria-label]") as HTMLElement).getAttribute("aria-label")).toBe(text);
  });

  it("honours the stagger delay: real text holds until the slot opens", () => {
    const text = "Contact";
    const { container } = render(<DecodeText delay={300}>{text}</DecodeText>);
    const inner = container.querySelector("span[aria-hidden]") as HTMLElement;
    act(() => {
      MockIO.instances[0].enter();
    });
    // Within the 300ms hold, still the real text (no scramble yet).
    act(() => {
      vi.advanceTimersByTime(FRAME_MS * 2);
    });
    expect(inner.textContent).toBe(text);
    // After the hold + a couple frames, it has begun scrambling.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(inner.textContent).toMatch(DIGITS);
  });
});
