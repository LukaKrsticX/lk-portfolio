"use client";
import { addEffect } from "@react-three/fiber";
import { useEffect } from "react";
import { pipelineRef, setSceneLive } from "@/lib/scroll";

/**
 * Lives INSIDE the Canvas: its mount lifecycle IS the scene-liveness signal
 * (unmounts with SceneBoundary errors too). addEffect runs before useFrame and
 * before render each rAF tick, with a ms DOMHighResTimeStamp — exactly what the
 * virtual pipeline's frame(time) wants, so useFrame consumers read fresh scroll same-frame.
 * Mount exactly once — the scene-live store is a boolean latch, not a refcount; a second Canvas root would kill the pipeline when the first unmounts.
 */
export function RafBridge() {
  useEffect(() => {
    setSceneLive(true);
    const off = addEffect((t) => pipelineRef.current?.frame(t));
    return () => {
      off();
      setSceneLive(false);
    };
  }, []);
  return null;
}
