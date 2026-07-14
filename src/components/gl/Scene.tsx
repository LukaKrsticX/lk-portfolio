"use client";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import type { Tier } from "@/lib/quality";
import { DPR_CAP } from "@/lib/quality";
import { CameraRig } from "./CameraRig";
import { Hero } from "./Hero";
import { RafBridge } from "./RafBridge";

export default function Scene({ tier, onDemote }: { tier: Tier; onDemote: () => void }) {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        opacity: ready ? 1 : 0,
        transition: "opacity 600ms ease",
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.6], fov: 42 }}
        dpr={[1, DPR_CAP[tier]]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
        }}
      >
        {/* Demote-only. bounds upper=1000 is LOAD-BEARING: drei's internal
            `flipped` counter increments on incline even with onIncline omitted,
            so a reachable upper bound would flag healthy 60Hz machines. */}
        <PerformanceMonitor bounds={() => [50, 1000]} onDecline={onDemote} />
        <RafBridge />
        <CameraRig />
        <Hero tier={tier} onReady={handleReady} />
      </Canvas>
    </div>
  );
}
