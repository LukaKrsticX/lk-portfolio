"use client";
import { useEffect, useMemo } from "react";
import { ExtrudeGeometry, Material, Path, Shape, Vector2 } from "three";
import { MONOGRAM_SHAPES } from "./monogram-data";

// Explicit bevel options are load-bearing: ExtrudeGeometry DEFAULTS to
// bevelEnabled:true with bevelThickness 0.2 in shape units — omitting these
// bloats the silhouette (verified against three r185 source).
const EXTRUDE = {
  depth: 0.22,
  bevelEnabled: true,
  bevelThickness: 0.02,
  bevelSize: 0.015,
  bevelSegments: 2,
  curveSegments: 4,
} as const;

export function Monogram({ material }: { material: Material }) {
  const geometry = useMemo(() => {
    const shapes = MONOGRAM_SHAPES.map((s) => {
      const shape = new Shape(s.points.map(([x, y]) => new Vector2(x, y)));
      for (const hole of s.holes) {
        shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
      }
      return shape;
    });
    const geo = new ExtrudeGeometry(shapes, EXTRUDE);
    geo.center();
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh geometry={geometry} material={material} />;
}
