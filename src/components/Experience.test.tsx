import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

const supportsWebGLMock = vi.fn(() => true);
vi.mock("@/lib/gl-support", () => ({ supportsWebGL: () => supportsWebGLMock() }));

const detectTierMock = vi.fn(() => Promise.resolve("med" as const));
vi.mock("@/lib/quality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quality")>();
  return { ...actual, detectTier: () => detectTierMock(), readTierCap: () => null };
});

import { Experience } from "./Experience";

beforeEach(() => {
  captureMock.mockClear();
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Experience analytics wiring", () => {
  it("fires quality_tier_selected once the tier settles", async () => {
    render(<Experience />);
    await waitFor(() =>
      expect(captureMock).toHaveBeenCalledWith("quality_tier_selected", {
        tier: "med",
        cause: "initial",
      }),
    );
  });

  it("fires webgl_fallback_triggered when WebGL is unsupported", async () => {
    supportsWebGLMock.mockReturnValueOnce(false);
    render(<Experience />);
    await waitFor(() =>
      expect(captureMock).toHaveBeenCalledWith("webgl_fallback_triggered", {
        cause: "no-webgl",
      }),
    );
  });
});
