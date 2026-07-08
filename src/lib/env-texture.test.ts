import { EquirectangularReflectionMapping } from "three";
import { describe, expect, it } from "vitest";
import { buildEnvironmentTexture, ENV_HEIGHT, ENV_WIDTH } from "./env-texture";

describe("buildEnvironmentTexture", () => {
  it("produces a correctly-shaped equirect texture", () => {
    const tex = buildEnvironmentTexture();
    expect(tex.image.width).toBe(ENV_WIDTH);
    expect(tex.image.height).toBe(ENV_HEIGHT);
    expect((tex.image.data as Uint8Array).length).toBe(ENV_WIDTH * ENV_HEIGHT * 4);
    expect(tex.mapping).toBe(EquirectangularReflectionMapping);
    tex.dispose();
  });
  it("key hotspot is much brighter than the dark base", () => {
    const tex = buildEnvironmentTexture();
    const data = tex.image.data as Uint8Array;
    const px = (u: number, v: number) => {
      const x = Math.round(u * (ENV_WIDTH - 1));
      const y = Math.round(v * (ENV_HEIGHT - 1));
      const i = (y * ENV_WIDTH + x) * 4;
      return data[i] + data[i + 1] + data[i + 2];
    };
    expect(px(0.22, 0.72)).toBeGreaterThan(px(0.0, 0.02) + 150);
    tex.dispose();
  });
  it("is fully opaque", () => {
    const tex = buildEnvironmentTexture();
    const data = tex.image.data as Uint8Array;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 255) throw new Error(`alpha at ${i} is ${data[i]}`);
    }
    tex.dispose();
  });
});
