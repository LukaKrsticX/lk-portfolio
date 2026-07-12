"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Group, MeshPhysicalMaterial } from "three";
import { debugFlag } from "@/lib/debug-flags";
import type { Tier } from "@/lib/quality";
import { clamp01, easeInOutSine, scrollMetrics, scrollSignals, scrollState, stepEnergy } from "@/lib/scroll";
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
  const scrollGroup = useRef<Group>(null);
  const monogramGroup = useRef<Group>(null);
  const prevY = useRef(0);
  const primed = useRef(false);
  const energyRef = useRef(0);

  // Soak-test bisection toggles (?ripple=0, ?irid=0) — constant per mount.
  const rippleOn = useMemo(() => debugFlag("ripple"), []);
  const iridOn = useMemo(() => debugFlag("irid"), []);
  const choreoOn = useMemo(() => debugFlag("choreo"), []);

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

    // Scroll signals: derived once per frame (Hero is the single writer), read
    // by HelixRibbon. Must run before the group-null early return so signals
    // keep flowing even on null-ref frames.
    // (child subscribes first → HelixRibbon reads last frame's values; accepted: one-frame lag on a smooth envelope)
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

    if (choreoOn) {
      const { p: scrollP, heroP } = scrollSignals;
      const sg = scrollGroup.current;
      if (sg) {
        sg.position.y = 0.5 * scrollP; // slower-than-DOM parallax lag
        sg.position.z = -0.9 * easeInOutSine(scrollP); // composition recedes (camera-dolly equivalent)
        sg.rotation.y = 0.15 * Math.sin(scrollP * Math.PI); // half-sweep, returns to 0 at page end
      }
      const mg = monogramGroup.current;
      if (mg) {
        mg.rotation.y = -0.85 * heroP * heroP; // monogram turns away leaving #hero
        mg.position.z = -1.3 * heroP * heroP; // recede instead of opacity (shared material!)
        mg.scale.setScalar(1.2 * (1 - 0.22 * heroP)); // shrink in concert (setScalar — no allocs)
      }
    }

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
      <group ref={scrollGroup}>
        <group ref={group} scale={tier === "low" ? 0.9 : 1}>
          <group ref={monogramGroup} scale={1.2}>
            <Monogram material={material} />
          </group>
          <HelixRibbon material={material} choreo={choreoOn} />
        </group>
      </group>
    </>
  );
}
