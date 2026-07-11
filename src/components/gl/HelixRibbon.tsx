"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, Material, PlaneGeometry } from "three";
import { twistPlanePositions } from "@/lib/helix";
import { clamp01, scrollSignals, smoothstep01 } from "@/lib/scroll";

const LENGTH = 7;
const WIDTH = 0.2;
const SEGMENTS = 256;
const TURNS = 2.25;
const RADIUS = 0.25; // > WIDTH/2 = 0.1 so the two strands clear each other
const HELIX_SCRUB = 2.5 * Math.PI;

function buildStrip(phase: number): PlaneGeometry {
  const geo = new PlaneGeometry(LENGTH, WIDTH, SEGMENTS, 1);
  geo.translate(0, RADIUS, 0); // off-axis: strands orbit the axis instead of straddling it
  twistPlanePositions(geo.attributes.position.array as Float32Array, LENGTH, TURNS, phase);
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals(); // correct shading for free — no shader twist needed
  return geo;
}

/** Double helix: two strips phase-shifted by π. Shares the hero material. */
export function HelixRibbon({ material, choreo = false }: { material: Material; choreo?: boolean }) {
  const drift = useRef<Group>(null);
  const group = useRef<Group>(null);
  const spinAcc = useRef(0);
  const strandA = useMemo(() => buildStrip(0), []);
  const strandB = useMemo(() => buildStrip(Math.PI), []);
  useEffect(
    () => () => {
      strandA.dispose();
      strandB.dispose();
    },
    [strandA, strandB],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30); // hidden-tab delta clamp
    spinAcc.current += dt * (0.22 + (choreo ? 1.5 * scrollSignals.energy : 0));
    if (group.current) {
      // Scroll phase is ASSIGNED, never +='d — scrub up rewinds it exactly.
      group.current.rotation.x = spinAcc.current + (choreo ? HELIX_SCRUB * scrollSignals.p : 0);
    }
    if (choreo && drift.current) {
      drift.current.position.x = 1.45 - 1.25 * smoothstep01(clamp01((scrollSignals.p - 0.12) / 0.55));
    }
  });

  return (
    <group ref={drift} position={[1.45, 0.1, -0.7]} rotation={[0, 0, -0.42]}>
      <group ref={group}>
        <mesh geometry={strandA} material={material} />
        <mesh geometry={strandB} material={material} />
      </group>
    </group>
  );
}
