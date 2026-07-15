"use client";
import { useEffect, useRef, type RefObject } from "react";
import { Vector2 } from "three";
import { pointerToUv } from "@/lib/pointer";

export interface PointerState {
  /** uv in [0,1]², y up */
  readonly uv: Vector2;
  /** ndc in [-1,1]², y up — for parallax and the card Raycaster */
  readonly ndc: Vector2;
  /** accumulated uv delta since last consume; exactly ONE consumer owns it (the ripple sim) and zeroes it after reading each frame */
  readonly velocity: Vector2;
  /** raw CSS pixel coords (y DOWN) — for document.elementFromPoint (the card-raycast interactive-DOM guard) */
  clientX: number;
  clientY: number;
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
    clientX: 0,
    clientY: 0,
    moved: false,
  });

  useEffect(() => {
    const onMove = (e: PointerEvent | MouseEvent): void => {
      // Two fingers down interleave pointermove from both pointerIds — uv
      // teleports and velocity spikes. Track the primary pointer only.
      if ("isPrimary" in e && !e.isPrimary) return;
      const s = state.current;
      const [u, v] = pointerToUv(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
      // Accumulate, don't overwrite: browsers coalesce pointermove to vsync,
      // not to our frame — on a janky frame several moves land between two
      // sim ticks and `set` would drop all but the last delta.
      if (s.moved) {
        s.velocity.x += u - s.uv.x;
        s.velocity.y += v - s.uv.y;
      }
      s.uv.set(u, v);
      s.ndc.set(u * 2 - 1, v * 2 - 1);
      // Raw CSS coords for the card-raycast guard — elementFromPoint expects layout px, y down.
      s.clientX = e.clientX;
      s.clientY = e.clientY;
      s.moved = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return state;
}
