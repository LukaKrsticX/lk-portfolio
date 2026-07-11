"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Group, MeshPhysicalMaterial } from "three";
import { debugFlag } from "@/lib/debug-flags";
import type { Tier } from "@/lib/quality";
import { buildEnvironmentTexture } from "./env-texture";
import { HelixRibbon } from "./HelixRibbon";
import { Monogram } from "./Monogram";
import { RippleBackground } from "./RippleBackground";
import { usePointerRipple } from "./use-pointer-ripple";
import { usePointerTracker } from "./use-pointer-tracker";

export function Hero({ tier, onReady }: { tier: Tier; onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);
  const drift = useRef(0);

  // Soak-test bisection toggles (?ripple=0, ?irid=0) — constant per mount.
  const rippleOn = useMemo(() => debugFlag("ripple"), []);
  const iridOn = useMemo(() => debugFlag("irid"), []);

  const pointer = usePointerTracker();
  const trail = usePointerRipple(pointer, rippleOn);

  // Iridescence is CONSTANT per mount: crossing 0 at runtime bumps
  // material.version → full program recompile → visible hitch on iGPU.
  const material = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: new Color("#0a1420"),
        metalness: 0.9,
        roughness: 0.22,
        iridescence: iridOn ? 1 : 0,
        iridescenceIOR: 1.6,
        iridescenceThicknessRange: [120, 480],
        envMapIntensity: 1.2,
        side: DoubleSide,
      }),
    [iridOn],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Static procedural environment; three auto-PMREMs it. NEVER animate it —
  // an env change re-runs full PMREM generation.
  useEffect(() => {
    const tex = buildEnvironmentTexture();
    scene.environment = tex;
    return () => {
      scene.environment = null;
      tex.dispose();
    };
  }, [scene]);

  // Precompile the physical shader behind the loader — first ANGLE/FXC compile
  // is the likeliest visible jank on Windows. Fade in on resolve.
  useEffect(() => {
    let cancelled = false;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) onReady();
      });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, onReady]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30); // hidden-tab delta clamp
    drift.current += dt;
    const g = group.current;
    if (!g) return;
    const p = pointer.current.ndc;
    // Slow drift + eased mouse parallax.
    const targetY = p.x * 0.22 + Math.sin(drift.current * 0.19) * 0.07;
    const targetX = -p.y * 0.14 + Math.cos(drift.current * 0.23) * 0.05;
    g.rotation.y += (targetY - g.rotation.y) * Math.min(1, dt * 3);
    g.rotation.x += (targetX - g.rotation.x) * Math.min(1, dt * 3);
  });

  return (
    <>
      <RippleBackground trail={trail} />
      <group ref={group} scale={tier === "low" ? 0.9 : 1}>
        <Monogram material={material} />
        <HelixRibbon material={material} />
      </group>
    </>
  );
}
