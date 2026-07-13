import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
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

vi.mock("@/components/Loader", () => ({
  Loader: ({ onDone }: { onDone: () => void }) => {
    useEffect(() => onDone(), [onDone]);
    return null;
  },
}));
vi.mock("@/components/gl/Scene", () => ({
  default: ({ onDemote }: { onDemote: () => void }) => (
    <button data-testid="demote" onClick={onDemote} />
  ),
}));

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

  it("demote persists the tier cap on commit, exactly once under StrictMode", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <StrictMode>
        <Experience />
      </StrictMode>,
    );
    fireEvent.click(await screen.findByTestId("demote"));
    await waitFor(() =>
      expect(captureMock).toHaveBeenCalledWith("quality_tier_selected", {
        tier: "low",
        cause: "demote",
      }),
    );
    const capWrites = setItemSpy.mock.calls.filter(([key]) => key === "lk-tier-cap");
    expect(capWrites).toHaveLength(1);
    expect(JSON.parse(capWrites[0][1] as string)).toMatchObject({ tier: "low" });
    setItemSpy.mockRestore();
    localStorage.removeItem("lk-tier-cap");
  });
});
