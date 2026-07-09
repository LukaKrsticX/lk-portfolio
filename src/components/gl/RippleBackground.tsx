"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Color, ShaderMaterial, Texture, Vector2 } from "three";

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Trail + faint idle waves, quantized through a Bayer matrix — the site's
// dither motif. Alpha stays low: the background must never fight the DOM text.
const BG_FRAG = /* glsl */ `
uniform sampler2D uTrail;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uResolution;
varying vec2 vUv;

// Arithmetic ordered dither — no arrays: dynamic array indexing is not
// guaranteed in GLSL ES 1.00 fragment shaders.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  // Screen-space sample: the trail texture is written in window uv, so sampling
  // by plane uv would scale the splat away from the cursor (plane is oversized
  // vs the frustum at z=-2). gl_FragCoord/resolution IS window uv — exact hit.
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float trail = texture2D(uTrail, screenUv).r;
  float idle = 0.5 + 0.5 * sin(uTime * 0.21 + vUv.x * 9.0) * sin(uTime * 0.13 + vUv.y * 7.0);
  float v = clamp(trail * 0.85 + idle * 0.05, 0.0, 1.0);
  float d = bayer4(gl_FragCoord.xy / 2.0);
  float lit = step(d, v);
  gl_FragColor = vec4(uColor * v * lit, v * lit * 0.35);
}
`;

export function RippleBackground({ trail }: { trail: RefObject<Texture | null> }) {
  const viewport = useThree((s) => s.viewport);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        uniforms: {
          uTrail: { value: null },
          uTime: { value: 0 },
          uColor: { value: new Color("#4da6e8") },
          uResolution: { value: new Vector2(1, 1) },
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const time = useRef(0);

  useFrame(({ gl }, delta) => {
    time.current += Math.min(delta, 1 / 30); // hidden-tab delta clamp
    material.uniforms.uTime.value = time.current;
    material.uniforms.uTrail.value = trail.current;
    gl.getDrawingBufferSize(material.uniforms.uResolution.value as Vector2);
  });

  // Oversized so it still covers the frustum at z=-2 with mild camera parallax.
  return (
    <mesh position={[0, 0, -2]} scale={[viewport.width * 1.8, viewport.height * 1.8, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
