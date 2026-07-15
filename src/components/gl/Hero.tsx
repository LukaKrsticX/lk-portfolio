"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Group, MeshPhysicalMaterial } from "three";
import { debugFlag } from "@/lib/debug-flags";
import type { Tier } from "@/lib/quality";
import { clamp01, scrollMetrics, scrollSignals, scrollState, stepEnergy } from "@/lib/scroll";
import { alphaEff } from "@/lib/virtual-scroll";
import { buildEnvironmentTexture } from "./env-texture";
import { HelixCards } from "./HelixCards";
import { HelixRibbon } from "./HelixRibbon";
import { Monogram } from "./Monogram";
import { RippleBackground } from "./RippleBackground";
import { usePointerRipple } from "./use-pointer-ripple";
import { usePointerTracker } from "./use-pointer-tracker";

export function Hero({ tier, onReady }: { tier: Tier; onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const monogramGroup = useRef<Group>(null);
  const prevY = useRef(0);
  const primed = useRef(false);
  const energyRef = useRef(0);

  // Soak-test bisection toggles (?ripple=0, ?irid=0) — constant per mount.
  const rippleOn = useMemo(() => debugFlag("ripple"), []);
  const iridOn = useMemo(() => debugFlag("irid"), []);
  const choreoOn = useMemo(() => debugFlag("choreo"), []);
  const workOn = useMemo(() => debugFlag("work"), []);

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

    // Scroll signals: derived once per frame (Hero is the single writer), read by the helix
    // axis and CameraRig (one-frame lag accepted — smooth envelopes).
    const y = scrollState.y;
    if (!primed.current) {
      prevY.current = y; // deep-link/restore landing: no first-frame velocity burst
      primed.current = true;
    }
    scrollSignals.p = clamp01(y / scrollMetrics.maxScroll);
    scrollSignals.heroP = clamp01(y / scrollMetrics.heroEnd);
    scrollSignals.workP = clamp01((y - scrollMetrics.workStart) / scrollMetrics.workSpan);
    const vel = (y - prevY.current) / Math.max(dt, 1e-4);
    prevY.current = y;
    energyRef.current = stepEnergy(energyRef.current, Math.min(1, Math.abs(vel) / 1800), dt);
    scrollSignals.energy = energyRef.current;
    // Velocity bus (single writer — spec §3): raw px/s, normalized ±1 at 2000px/s, and a
    // long-tail smooth for the axis bow / echo / chromatic consumers.
    scrollSignals.vel = vel;
    scrollSignals.velN = vel > 2000 ? 1 : vel < -2000 ? -1 : vel / 2000;
    scrollSignals.velSm += (scrollSignals.velN - scrollSignals.velSm) * alphaEff(0.05, dt);

    // Monogram recede leaving #hero (heroP-driven, shared material → recede not opacity). The
    // scrollGroup dolly/sway and pointer-parallax idle-sway are retired — CameraRig owns motion.
    if (choreoOn) {
      const heroP = scrollSignals.heroP;
      const mg = monogramGroup.current;
      if (mg) {
        mg.rotation.y = -0.85 * heroP * heroP; // monogram turns away leaving #hero
        mg.position.z = -1.3 * heroP * heroP; // recede instead of opacity (shared material!)
        mg.scale.setScalar(1.2 * (1 - 0.22 * heroP)); // shrink in concert (setScalar — no allocs)
      }
    }
  });

  return (
    <>
      <RippleBackground trail={trail} />
      {/* CameraRig (Scene.tsx) owns dolly/sway/parallax now — this group is a static
          scale wrapper; the monogram recede stays Hero's (heroP-driven). HelixCards live
          INSIDE it, alongside the ribbon, so they inherit the same tier scale and axis frame. */}
      <group scale={tier === "low" ? 0.9 : 1}>
        <group ref={monogramGroup} scale={1.2}>
          <Monogram material={material} />
        </group>
        <HelixRibbon material={material} choreo={choreoOn} />
        {workOn && <HelixCards tier={tier} choreo={choreoOn} />}
      </group>
    </>
  );
}
