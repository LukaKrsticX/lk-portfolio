import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

type IOCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
let ioCallback: IOCallback | null = null;
const observed: Element[] = [];

class IOStub {
  constructor(cb: IOCallback) {
    ioCallback = cb;
  }
  observe(el: Element) {
    observed.push(el);
  }
  disconnect() {
    observed.length = 0;
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IOStub);
  captureMock.mockClear();
  ioCallback = null;
  observed.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount(path: string) {
  pathname = path;
  const { Analytics } = await import("./Analytics");
  return render(<Analytics />);
}

describe("Analytics wiring", () => {
  it("fires page_view once with the path", async () => {
    await mount("/");
    expect(captureMock).toHaveBeenCalledWith("page_view", { path: "/" });
    expect(captureMock).toHaveBeenCalledTimes(1); // no sections in DOM yet
  });

  it("fires agencies_page_view on /agencies in addition to page_view", async () => {
    await mount("/agencies");
    expect(captureMock).toHaveBeenCalledWith("page_view", { path: "/agencies" });
    expect(captureMock).toHaveBeenCalledWith("agencies_page_view");
  });

  it("fires scene_reached once per section, not on re-intersection", async () => {
    document.body.innerHTML = '<section id="hero"></section><section id="work"></section>';
    await mount("/");
    expect(observed).toHaveLength(2);
    const hero = document.getElementById("hero") as Element;
    ioCallback?.([{ target: hero, isIntersecting: true }]);
    ioCallback?.([{ target: hero, isIntersecting: false }]);
    ioCallback?.([{ target: hero, isIntersecting: true }]);
    const sceneCalls = captureMock.mock.calls.filter(([e]) => e === "scene_reached");
    expect(sceneCalls).toEqual([["scene_reached", { scene: "hero" }]]);
  });
});
