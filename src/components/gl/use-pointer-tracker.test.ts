import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePointerTracker } from "./use-pointer-tracker";

function move(x: number, y: number): void {
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
}

describe("usePointerTracker", () => {
  it("tracks uv and velocity from window pointermove", () => {
    const { result } = renderHook(() => usePointerTracker());
    act(() => move(window.innerWidth / 2, window.innerHeight / 2));
    expect(result.current.current.uv.x).toBeCloseTo(0.5);
    expect(result.current.current.uv.y).toBeCloseTo(0.5);
    act(() => move(window.innerWidth * 0.6, window.innerHeight / 2));
    expect(result.current.current.velocity.x).toBeCloseTo(0.1, 1);
    expect(result.current.current.moved).toBe(true);
  });
  it("removes the listener on unmount", () => {
    const { result, unmount } = renderHook(() => usePointerTracker());
    unmount();
    act(() => move(1, 1));
    expect(result.current.current.moved).toBe(false); // no update after unmount
  });
});
