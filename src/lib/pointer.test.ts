import { describe, expect, it } from "vitest";
import { pointerToUv } from "./pointer";

describe("pointerToUv", () => {
  it("maps client coords to GL uv (y up)", () => {
    expect(pointerToUv(0, 768, 1024, 768)).toEqual([0, 0]);
    expect(pointerToUv(1024, 0, 1024, 768)).toEqual([1, 1]);
    expect(pointerToUv(512, 384, 1024, 768)).toEqual([0.5, 0.5]);
  });
  it("guards zero-sized viewports", () => {
    expect(pointerToUv(10, 10, 0, 0)).toEqual([0.5, 0.5]);
  });
});
