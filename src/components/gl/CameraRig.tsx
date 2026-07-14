"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { debugFlag } from "@/lib/debug-flags";
import { blendAt } from "@/lib/keypoints";
import { keypointsStore, scrollSignals } from "@/lib/scroll";
import { usePointerTracker } from "./use-pointer-tracker";

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

interface Waypoint {
  /** camera world position */
  readonly pos: Vec3;
  /** lookAt target */
  readonly look: Vec3;
  /** vertical fov */
  readonly fov: number;
  /** pointer-parallax amplitude (x,y world units per ndc unit) */
  readonly moveXY: Vec2;
}

// Hero MUST be exactly [0,0,3.6] / fov 42 — p=0 pixel parity with `main` is a gate.
const HERO: Waypoint = { pos: [0, 0, 3.6], look: [0, 0, 0], fov: 42, moveXY: [0.4, 0.2] };

const WAYPOINTS: Record<string, Waypoint> = {
  hero: HERO,
  services: { pos: [0.1, -0.05, 3.4], look: [0, -0.05, 0], fov: 40, moveXY: [0.35, 0.18] },
  work: { pos: [0, 0, 3.0], look: [0, 0, -1], fov: 34, moveXY: [0.2, 0.12] }, // overridden by the rail
  process: { pos: [-0.25, 0.05, 3.2], look: [-0.1, 0, -0.2], fov: 38, moveXY: [0.3, 0.16] },
  about: { pos: [0.3, 0.1, 3.1], look: [0.1, 0.05, -0.2], fov: 38, moveXY: [0.3, 0.16] },
  contact: { pos: [0, 0, 3.4], look: [0, 0, 0], fov: 40, moveXY: [0.25, 0.14] },
};

// Work rail — P2 PLACEHOLDER: a 2-point dive across the work span (workP). P3 replaces this with
// railWaypoint(workP, N) from workrail.ts (camera dives card-to-card along the opened axis).
const RAIL_START: Waypoint = { pos: [0.25, 0, 3.0], look: [0, 0, -1.0], fov: 34, moveXY: [0.2, 0.12] };
const RAIL_END: Waypoint = { pos: [-0.25, 0, 2.6], look: [0, 0, -1.2], fov: 34, moveXY: [0.2, 0.12] };

const clampSym = (v: number, m: number): number => (v > m ? m : v < -m ? -m : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpV3 = (a: Vec3, b: Vec3, t: number, out: Vector3): Vector3 =>
  out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
// Framerate-normalized lerp factor (mirrors virtual-scroll.alphaEff) for the fov/wobble/roll
// timescales — kept local so this component stays free of the scroll-pipeline import.
const alphaEff = (a: number, dt: number): number => 1 - Math.pow(1 - a, dt * 60);

function waypointFor(id: string, workP: number, out: { pos: Vector3; look: Vector3; fov: number; moveXY: [number, number] }): void {
  if (id === "work") {
    lerpV3(RAIL_START.pos, RAIL_END.pos, workP, out.pos);
    lerpV3(RAIL_START.look, RAIL_END.look, workP, out.look);
    out.fov = lerp(RAIL_START.fov, RAIL_END.fov, workP);
    out.moveXY[0] = lerp(RAIL_START.moveXY[0], RAIL_END.moveXY[0], workP);
    out.moveXY[1] = lerp(RAIL_START.moveXY[1], RAIL_END.moveXY[1], workP);
    return;
  }
  const w = WAYPOINTS[id] ?? HERO;
  out.pos.set(w.pos[0], w.pos[1], w.pos[2]);
  out.look.set(w.look[0], w.look[1], w.look[2]);
  out.fov = w.fov;
  out.moveXY[0] = w.moveXY[0];
  out.moveXY[1] = w.moveXY[1];
}

/**
 * Drives the R3F-created camera (useThree — the SAME camera the Canvas prop made; never a new
 * one, never a remount) along per-section waypoints. Retires Hero's fake scrollGroup parallax.
 * Three timescales: base pos/look damped (λ4), fov lerped α0.1 (updateProjectionMatrix only on a
 * real change), a slower α0.025 hand-held wobble, and a velN-driven roll. choreo off → static
 * hero (matches `main`), so ?choreo=0 is a clean control.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const pointer = usePointerTracker();
  const choreoOn = useMemo(() => debugFlag("choreo"), []);

  const posRef = useRef(new Vector3(HERO.pos[0], HERO.pos[1], HERO.pos[2]));
  const lookRef = useRef(new Vector3(HERO.look[0], HERO.look[1], HERO.look[2]));
  const wobble = useRef(new Vector3());
  const wobbleT = useRef(0);
  const rollRef = useRef(0);
  // Scratch — reused each frame (no per-frame allocation in the loop).
  const wp = useRef({ pos: new Vector3(), look: new Vector3(), fov: HERO.fov, moveXY: [0, 0] as [number, number] });
  const fromWp = useRef({ pos: new Vector3(), look: new Vector3(), fov: HERO.fov, moveXY: [0, 0] as [number, number] });

  useFrame((_, delta) => {
    const cam = camera as PerspectiveCamera;
    if (!cam.isPerspectiveCamera) return;
    const dt = Math.min(delta, 1 / 30);

    if (!choreoOn) {
      // Static hero baseline — byte-parity with main's fixed camera.
      cam.position.set(HERO.pos[0], HERO.pos[1], HERO.pos[2]);
      cam.lookAt(HERO.look[0], HERO.look[1], HERO.look[2]);
      cam.rotation.z = 0;
      if (Math.abs(cam.fov - HERO.fov) > 0.01) {
        cam.fov = HERO.fov;
        cam.updateProjectionMatrix();
      }
      return;
    }

    const p = scrollSignals.p;
    const workP = scrollSignals.workP;
    const b = blendAt(keypointsStore.current, p);
    waypointFor(b.from, workP, fromWp.current);
    waypointFor(b.to, workP, wp.current);
    const t = b.t;

    // Blend the two section waypoints, then add pointer parallax to the target position.
    const from = fromWp.current;
    const to = wp.current;
    const moveX = lerp(from.moveXY[0], to.moveXY[0], t);
    const moveY = lerp(from.moveXY[1], to.moveXY[1], t);
    const targetX = lerp(from.pos.x, to.pos.x, t) + pointer.current.ndc.x * moveX;
    const targetY = lerp(from.pos.y, to.pos.y, t) + pointer.current.ndc.y * moveY;
    const targetZ = lerp(from.pos.z, to.pos.z, t);

    // Base position — damped (λ4). Wobble is a SEPARATE slower timescale (α0.025), summed on top
    // so it never feeds back into the damp. Both sines start at 0 → no offset at load (p=0 parity).
    posRef.current.set(
      MathUtils.damp(posRef.current.x, targetX, 4, dt),
      MathUtils.damp(posRef.current.y, targetY, 4, dt),
      MathUtils.damp(posRef.current.z, targetZ, 4, dt),
    );
    wobbleT.current += dt;
    const wa = alphaEff(0.025, dt);
    wobble.current.x += (Math.sin(wobbleT.current * 2 * Math.PI * 0.13) * 0.06 - wobble.current.x) * wa;
    wobble.current.y += (Math.sin(wobbleT.current * 2 * Math.PI * 0.17) * 0.06 - wobble.current.y) * wa;
    cam.position.set(posRef.current.x + wobble.current.x, posRef.current.y + wobble.current.y, posRef.current.z);

    // Look target — damped (λ4). lookAt sets the quaternion; roll (rotation.z) is applied after.
    lookRef.current.set(
      MathUtils.damp(lookRef.current.x, lerp(from.look.x, to.look.x, t), 4, dt),
      MathUtils.damp(lookRef.current.y, lerp(from.look.y, to.look.y, t), 4, dt),
      MathUtils.damp(lookRef.current.z, lerp(from.look.z, to.look.z, t), 4, dt),
    );
    cam.lookAt(lookRef.current);

    // Velocity roll: world tilt ∝ velN, capped ±0.05 rad, eased α0.1.
    const rollTarget = clampSym(scrollSignals.velN * 0.05, 0.05);
    rollRef.current += (rollTarget - rollRef.current) * alphaEff(0.1, dt);
    cam.rotation.z = rollRef.current;

    // fov scrub — α0.1, and updateProjectionMatrix ONLY on a real change (≥0.01) to avoid churn.
    const targetFov = lerp(from.fov, to.fov, t);
    const newFov = cam.fov + (targetFov - cam.fov) * alphaEff(0.1, dt);
    if (Math.abs(newFov - cam.fov) > 0.01) {
      cam.fov = newFov;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
