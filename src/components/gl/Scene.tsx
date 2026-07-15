"use client";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useMemo, useState } from "react";
import { debugFlag } from "@/lib/debug-flags";
import type { Tier } from "@/lib/quality";
import { DPR_CAP } from "@/lib/quality";
import { CameraRig } from "./CameraRig";
import { Hero } from "./Hero";
import { PortalLayer } from "./PortalLayer";
import { PostChain } from "./PostChain";
import { RafBridge } from "./RafBridge";

export default function Scene({ tier, onDemote }: { tier: Tier; onDemote: () => void }) {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  // Post is a med+ filmic layer, gated by ?post. The mount is tied to `tier`, so a mid-session
  // PerformanceMonitor demote to low UNMOUNTS PostChain → its priority-1 subscriber goes away →
  // R3F resumes auto-render (today's byte-exact path). Low tier never mounts it at all.
  const postOn = useMemo(() => debugFlag("post"), []);

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
        {/* PortalLayer steps the portal machine + publishes camT BEFORE CameraRig reads it (same
            frame). It renders the fullscreen wipe quad above the scene (renderOrder 9999). */}
        <PortalLayer />
        <CameraRig />
        <Hero tier={tier} onReady={handleReady} />
        {/* Render-takeover post (priority-1 useFrame). Mounted last so its manual gl.render sees the
            fully-updated scene. tier!=="low" ties the mount to the demote path; ?post=0 skips it. */}
        {tier !== "low" && postOn && <PostChain tier={tier} />}
      </Canvas>
    </div>
  );
}
