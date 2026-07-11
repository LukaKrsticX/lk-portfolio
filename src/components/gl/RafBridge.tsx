"use client";
import { addEffect } from "@react-three/fiber";
import { useEffect } from "react";
import { lenisRef, setSceneLive } from "@/lib/scroll";

/**
 * Lives INSIDE the Canvas: its mount lifecycle IS the scene-liveness signal
 * (unmounts with SceneBoundary errors too). addEffect runs before useFrame and
 * before render each rAF tick, with a ms DOMHighResTimeStamp — exactly what
 * lenis.raf(time) wants, so useFrame consumers read fresh scroll same-frame.
 */
export function RafBridge() {
  useEffect(() => {
    setSceneLive(true);
    const off = addEffect((t) => lenisRef.current?.raf(t));
    return () => {
      off();
      setSceneLive(false);
    };
  }, []);
  return null;
}
