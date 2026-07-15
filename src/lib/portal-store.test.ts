import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

import { site } from "@/content/site";
import { scrollMode } from "./scroll";
import {
  closePortal,
  finalizePortalClosed,
  getPortalView,
  isPortalActive,
  navigatePortal,
  openPortal,
  portalMachine,
  resetPortalForTests,
} from "./portal-store";

const HOLIMED = 0;
const CEA = 1;

beforeEach(() => {
  captureMock.mockClear();
  window.history.replaceState("", "", "/");
  scrollMode.virtual = true; // virtual-mode is the gate for the whole feature
  resetPortalForTests();
});

afterEach(() => {
  resetPortalForTests();
  scrollMode.virtual = false;
  window.history.replaceState("", "", "/");
});

describe("openPortal gating", () => {
  it("no-ops (no dialog, no analytics, no hash) when NOT in virtual mode", () => {
    scrollMode.virtual = false;
    openPortal(HOLIMED, "click");
    expect(getPortalView().slug).toBeNull();
    expect(isPortalActive()).toBe(false);
    expect(captureMock).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
  });

  it("no-ops when ?portal=0 even in virtual mode", () => {
    window.history.replaceState("", "", "/?portal=0");
    openPortal(HOLIMED, "click");
    expect(getPortalView().slug).toBeNull();
    expect(isPortalActive()).toBe(false);
  });

  it("ignores an out-of-range index", () => {
    openPortal(99, "click");
    expect(getPortalView().slug).toBeNull();
  });
});

describe("openPortal / closePortal lifecycle", () => {
  it("opens: sets the view, activates, drives the machine, pushes the hash, fires portal_open", () => {
    openPortal(HOLIMED, "click");
    expect(getPortalView()).toEqual({ index: HOLIMED, slug: "holimed" });
    expect(isPortalActive()).toBe(true);
    expect(portalMachine.phase).toBe("opening");
    expect(location.hash).toBe("#case-holimed");
    expect(captureMock).toHaveBeenCalledWith("portal_open", { slug: "holimed", cause: "click" });
  });

  it("ignores a second open while one is engaged (prev/next uses navigate instead)", () => {
    openPortal(HOLIMED, "click");
    captureMock.mockClear();
    openPortal(CEA, "click");
    expect(getPortalView().slug).toBe("holimed"); // unchanged
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("closes: unmounts the dialog at once (slug→null) but keeps the lock until finalize", () => {
    openPortal(HOLIMED, "click");
    closePortal("esc");
    expect(getPortalView().slug).toBeNull(); // dialog unmounts immediately → focus restore
    expect(portalMachine.phase).toBe("closing");
    expect(isPortalActive()).toBe(true); // scroll stays locked through the reverse wipe
    expect(captureMock).toHaveBeenCalledWith("portal_close", { slug: "holimed", cause: "esc" });
    // machine reaches closed → PortalLayer finalizes → lock drops
    portalMachine.step(1);
    finalizePortalClosed();
    expect(isPortalActive()).toBe(false);
  });

  it("navigatePortal swaps the case without re-animating the wipe (uses replaceState)", () => {
    openPortal(HOLIMED, "click");
    // drive to fully open
    portalMachine.step(2);
    expect(portalMachine.phase).toBe("open");
    captureMock.mockClear();
    navigatePortal(CEA);
    expect(getPortalView()).toEqual({ index: CEA, slug: "cea" });
    expect(portalMachine.phase).toBe("open"); // NOT restarted
    expect(location.hash).toBe("#case-cea");
    expect(captureMock).toHaveBeenCalledWith("portal_open", { slug: "cea", cause: "click" });
  });

  it("navigatePortal no-ops when closed or to the same case", () => {
    navigatePortal(CEA); // not active
    expect(getPortalView().slug).toBeNull();
    openPortal(HOLIMED, "click");
    captureMock.mockClear();
    navigatePortal(HOLIMED); // same case
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("has exactly the two site cases wired (N=2 → prev/next is the other one)", () => {
    expect(site.cases.map((c) => c.slug)).toEqual(["holimed", "cea"]);
  });
});
