"use client";
import { Canvas } from "@react-three/fiber";
import type { Tier } from "@/lib/quality";
import { DPR_CAP } from "@/lib/quality";
import { Starfield } from "./Starfield";

export default function Scene({ tier }: { tier: Tier }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1 }}>
      <Canvas
        dpr={[1, DPR_CAP[tier]]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
        }}
      >
        <Starfield count={tier === "low" ? 300 : 800} />
      </Canvas>
    </div>
  );
}
