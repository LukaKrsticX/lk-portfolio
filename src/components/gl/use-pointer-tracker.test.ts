import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePointerTracker } from "./use-pointer-tracker";

function move(x: number, y: number): void {
  // jsdom's PointerEvent defaults isPrimary to false; the tracker filters
  // non-primary pointers, so the helper must mark its events primary.
  window.dispatchEvent(
    new PointerEvent("pointermove", { clientX: x, clientY: y, isPrimary: true }),
  );
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
  it("accumulates velocity across consecutive moves (coalesced deltas must sum, not overwrite)", () => {
    const { result } = renderHook(() => usePointerTracker());
    act(() => move(window.innerWidth / 2, window.innerHeight / 2));
    act(() => move(window.innerWidth * 0.6, window.innerHeight / 2));
    act(() => move(window.innerWidth * 0.7, window.innerHeight / 2));
    // 0.5→0.6→0.7: both 0.1 deltas sum to 0.2; overwrite semantics would give 0.1.
    expect(result.current.current.velocity.x).toBeCloseTo(0.2, 1);
  });
  it("keeps velocity at zero on the very first move (no prior uv to diff)", () => {
    const { result } = renderHook(() => usePointerTracker());
    act(() => move(window.innerWidth * 0.25, window.innerHeight * 0.25));
    expect(result.current.current.velocity.x).toBe(0);
    expect(result.current.current.velocity.y).toBe(0);
  });
  it("ignores non-primary pointers (multi-touch would teleport uv)", () => {
    const { result } = renderHook(() => usePointerTracker());
    act(() =>
      window.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 10, clientY: 10, isPrimary: false }),
      ),
    );
    expect(result.current.current.moved).toBe(false);
  });
  it("removes the listener on unmount", () => {
    const { result, unmount } = renderHook(() => usePointerTracker());
    unmount();
    act(() => move(1, 1));
    expect(result.current.current.moved).toBe(false); // no update after unmount
  });
});
