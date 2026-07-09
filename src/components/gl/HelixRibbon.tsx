"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, Material, PlaneGeometry } from "three";
import { twistPlanePositions } from "@/lib/helix";

const LENGTH = 7;
const WIDTH = 0.34;
const SEGMENTS = 256;
const TURNS = 2.25;

function buildStrip(phase: number): PlaneGeometry {
  const geo = new PlaneGeometry(LENGTH, WIDTH, SEGMENTS, 1);
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
    <group ref={group} position={[0.6, -0.15, -0.9]} rotation={[0, 0, -0.42]}>
      <mesh geometry={strandA} material={material} />
      <mesh geometry={strandB} material={material} />
    </group>
  );
}
