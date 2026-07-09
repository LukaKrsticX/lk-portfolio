"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, Material, PlaneGeometry } from "three";
import { twistPlanePositions } from "@/lib/helix";

const LENGTH = 7;
const WIDTH = 0.2;
const SEGMENTS = 256;
const TURNS = 2.25;
const RADIUS = 0.25; // > WIDTH/2 = 0.1 so the two strands clear each other

function buildStrip(phase: number): PlaneGeometry {
  const geo = new PlaneGeometry(LENGTH, WIDTH, SEGMENTS, 1);
  geo.translate(0, RADIUS, 0); // off-axis: strands orbit the axis instead of straddling it
  twistPlanePositions(geo.attributes.position.array as Float32Array, LENGTH, TURNS, phase);
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals(); // correct shading for free — no shader twist needed
  return geo;
}

/** Double helix: two strips phase-shifted by π. Shares the hero material. */
export function HelixRibbon({ material }: { material: Material }) {
  const group = useRef<Group>(null);
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
    if (group.current) group.current.rotation.x += dt * 0.22;
  });

  return (
    <group position={[1.1, 0.1, -0.7]} rotation={[0, 0, -0.42]}>
      <group ref={group}>
        <mesh geometry={strandA} material={material} />
        <mesh geometry={strandB} material={material} />
      </group>
    </group>
  );
}
