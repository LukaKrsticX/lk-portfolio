import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

import { SceneBoundary } from "./SceneBoundary";

function Thrower(): never {
  throw new Error("shader boom");
}

afterEach(() => {
  captureMock.mockClear();
});

describe("SceneBoundary analytics", () => {
  it("renders null and fires webgl_fallback_triggered on a GL crash", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <SceneBoundary>
        <Thrower />
      </SceneBoundary>,
    );
    expect(container.firstChild).toBeNull();
    expect(captureMock).toHaveBeenCalledWith("webgl_fallback_triggered", {
      cause: "scene-error",
    });
    consoleSpy.mockRestore();
  });
});
