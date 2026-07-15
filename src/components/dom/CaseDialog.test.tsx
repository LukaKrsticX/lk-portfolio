import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

import { site } from "@/content/site";
import { openPortal, resetPortalForTests } from "@/lib/portal-store";
import { scrollMode } from "@/lib/scroll";
import { CaseDialog } from "./CaseDialog";

function stubMatchMedia(matches: Record<string, boolean>): void {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: matches[q] ?? false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const HOLIMED = site.cases[0];
const CEA = site.cases[1];

beforeEach(() => {
  stubMatchMedia({});
  captureMock.mockClear();
  window.history.replaceState("", "", "/");
  scrollMode.virtual = true; // the portal only engages in virtual mode
  resetPortalForTests();
});

afterEach(() => {
  resetPortalForTests();
  scrollMode.virtual = false;
  window.history.replaceState("", "", "/");
  vi.unstubAllGlobals();
});

/** Focusable descendants in tab order, in the same order the trap computes them. */
function focusablesOf(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
}

describe("CaseDialog aria + content", () => {
  it("mounts a labelled modal dialog with the case story, live link and prev/next", () => {
    render(<CaseDialog />);
    act(() => openPortal(0, "click"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(HOLIMED.title);
    expect(dialog).toHaveTextContent(HOLIMED.story.broken);
    expect(dialog).toHaveTextContent(HOLIMED.story.result);
    // "Visit live ↗" → the case's real external URL.
    expect(screen.getByRole("link", { name: /visit live/i })).toHaveAttribute("href", HOLIMED.url);
    // prev AND next both point at the other case (N=2 → two buttons naming CEA).
    expect(screen.getAllByRole("button", { name: new RegExp(CEA.title) })).toHaveLength(2);
  });
});

describe("CaseDialog focus trap", () => {
  it("focuses the heading on open and restores focus to the source on close", () => {
    const source = document.createElement("button");
    document.body.appendChild(source);
    source.focus();
    expect(source).toHaveFocus();

    render(<CaseDialog />);
    act(() => openPortal(0, "click"));
    expect(document.getElementById("case-dialog-title")).toHaveFocus();

    act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(source).toHaveFocus(); // focus returned to the opener
    source.remove();
  });

  it("cycles Tab at the boundaries (last→first, first→last) and never leaves the dialog", () => {
    render(<CaseDialog />);
    act(() => openPortal(0, "click"));
    const dialog = screen.getByRole("dialog");
    const items = focusablesOf(dialog);
    expect(items.length).toBeGreaterThanOrEqual(3);
    const first = items[0];
    const last = items[items.length - 1];

    last.focus();
    act(() => fireEvent.keyDown(document, { key: "Tab" }));
    expect(first).toHaveFocus(); // forward wrap

    first.focus();
    act(() => fireEvent.keyDown(document, { key: "Tab", shiftKey: true }));
    expect(last).toHaveFocus(); // backward wrap
  });
});

describe("CaseDialog close paths", () => {
  it("Escape closes and fires portal_close {cause: esc}", () => {
    render(<CaseDialog />);
    act(() => openPortal(0, "click"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(captureMock).toHaveBeenCalledWith("portal_close", { slug: HOLIMED.slug, cause: "esc" });
  });

  it("popstate (browser Back) closes an open portal with {cause: pop}", () => {
    render(<CaseDialog />);
    act(() => openPortal(0, "click"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(captureMock).toHaveBeenCalledWith("portal_close", { slug: HOLIMED.slug, cause: "pop" });
  });

  it("the close button dismisses the dialog", () => {
    render(<CaseDialog />);
    act(() => openPortal(0, "click"));
    act(() => fireEvent.click(screen.getByRole("button", { name: /close case/i })));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CaseDialog parity — never mounts outside virtual mode", () => {
  it("a #case-x deep link in reduced-motion (native) mode mounts NO dialog", () => {
    stubMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    scrollMode.virtual = false; // reduced motion → native scroll → portal disabled
    window.history.replaceState("", "", "/#case-holimed");
    render(<CaseDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    // and an explicit open request is a no-op too (store guards on virtual mode)
    act(() => openPortal(0, "pop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("?portal=0 renders nothing even in virtual mode", () => {
    window.history.replaceState("", "", "/?portal=0");
    render(<CaseDialog />);
    act(() => openPortal(0, "click"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
