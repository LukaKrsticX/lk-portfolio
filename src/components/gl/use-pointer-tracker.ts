"use client";
import { useEffect, useRef, type RefObject } from "react";
import { Vector2 } from "three";
import { pointerToUv } from "@/lib/pointer";

export interface PointerState {
  /** uv in [0,1]², y up */
  readonly uv: Vector2;
  /** ndc in [-1,1]², y up — for parallax */
  readonly ndc: Vector2;
  /** uv delta of the last move event; consumers zero it after use */
  readonly velocity: Vector2;
  moved: boolean;
}

/**
 * Window-level pointer tracking. R3F pointer events can never reach the canvas:
 * its wrapper div sits at zIndex:-1 UNDER the DOM sections, so hit-testing gives
 * every event to the DOM layer. A window listener is the robust + cheap path
 * (no raycast per move).
 */
export function usePointerTracker(): RefObject<PointerState> {
  const state = useRef<PointerState>({
    uv: new Vector2(0.5, 0.5),
    ndc: new Vector2(0, 0),
    velocity: new Vector2(0, 0),
    moved: false,
  });

  useEffect(() => {
    const onMove = (e: PointerEvent | MouseEvent): void => {
      const s = state.current;
      const [u, v] = pointerToUv(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
      if (s.moved) s.velocity.set(u - s.uv.x, v - s.uv.y);
      s.uv.set(u, v);
      s.ndc.set(u * 2 - 1, v * 2 - 1);
      s.moved = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return state;
}
