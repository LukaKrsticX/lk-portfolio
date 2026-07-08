import { describe, expect, it } from "vitest";
import { debugFlag, debugTier } from "./debug-flags";

describe("debugFlag", () => {
  it("defaults to enabled", () => {
    expect(debugFlag("ripple", "")).toBe(true);
    expect(debugFlag("ripple", "?other=0")).toBe(true);
  });
  it("=0 disables", () => {
    expect(debugFlag("ripple", "?ripple=0")).toBe(false);
    expect(debugFlag("irid", "?ripple=0&irid=0")).toBe(false);
  });
});

describe("debugTier", () => {
  it("returns a valid tier override or null", () => {
    expect(debugTier("?tier=med")).toBe("med");
    expect(debugTier("?tier=ultra")).toBeNull();
    expect(debugTier("")).toBeNull();
  });
});
