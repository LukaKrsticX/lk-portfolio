import { describe, expect, it } from "vitest";
import { debugChoice, debugFlag, debugTier } from "./debug-flags";

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

describe("debugFlag scroll", () => {
  it("defaults to enabled", () => {
    expect(debugFlag("scroll", "")).toBe(true);
    expect(debugFlag("scroll", "?other=0")).toBe(true);
  });
  it("=0 disables", () => {
    expect(debugFlag("scroll", "?scroll=0")).toBe(false);
  });
});

describe("debugFlag choreo", () => {
  it("defaults to enabled", () => {
    expect(debugFlag("choreo", "")).toBe(true);
    expect(debugFlag("choreo", "?other=0")).toBe(true);
  });
  it("=0 disables", () => {
    expect(debugFlag("choreo", "?choreo=0")).toBe(false);
  });
});

describe("debugTier", () => {
  it("returns a valid tier override or null", () => {
    expect(debugTier("?tier=med")).toBe("med");
    expect(debugTier("?tier=ultra")).toBeNull();
    expect(debugTier("")).toBeNull();
  });
});

describe("debugChoice", () => {
  it("absence means control (null)", () => {
    expect(debugChoice("variant", ["a", "b"], "")).toBeNull();
    expect(debugChoice("variant", ["a", "b"], "?other=a")).toBeNull();
  });
  it("unlisted value means control (null)", () => {
    expect(debugChoice("variant", ["a", "b"], "?variant=z")).toBeNull();
  });
  it("picks a listed choice", () => {
    expect(debugChoice("variant", ["a", "b"], "?variant=b")).toBe("b");
    expect(debugChoice("variant", ["a", "b"], "?variant=a&other=0")).toBe("a");
  });
});
