import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom ships no matchMedia. Provide a benign default (everything unmatched) so any component
// using useMediaQuery renders in tests without a per-file stub; tests that care still override it
// with vi.stubGlobal("matchMedia", …) (and vi.unstubAllGlobals restores this default).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
