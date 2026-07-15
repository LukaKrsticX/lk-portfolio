import { describe, expect, it } from "vitest";
import { HOVER_ALPHA, hoverStep, isInteractiveTarget } from "./card-raycast";

describe("isInteractiveTarget", () => {
  it("is false for null and for plain non-interactive elements", () => {
    expect(isInteractiveTarget(null)).toBe(false);
    const div = document.createElement("div");
    expect(isInteractiveTarget(div)).toBe(false);
  });

  it("is true for the interactive controls the cards must yield to", () => {
    for (const tag of ["a", "button", "input", "textarea", "select"]) {
      expect(isInteractiveTarget(document.createElement(tag))).toBe(true);
    }
    const roleBtn = document.createElement("div");
    roleBtn.setAttribute("role", "button");
    expect(isInteractiveTarget(roleBtn)).toBe(true);
    const focusable = document.createElement("div");
    focusable.setAttribute("tabindex", "0");
    expect(isInteractiveTarget(focusable)).toBe(true);
  });

  it("is false for tabindex=-1 focus targets (sections) — kills the guard-suppresses-everything mutant", () => {
    // Sections.tsx renders <section tabIndex={-1}> as a11y focus targets across the
    // whole page; treating them as interactive made hover/click dead everywhere.
    const section = document.createElement("section");
    section.setAttribute("tabindex", "-1");
    expect(isInteractiveTarget(section)).toBe(false);
    const child = document.createElement("p");
    section.appendChild(child);
    expect(isInteractiveTarget(child)).toBe(false);
  });

  it("walks up to an interactive ancestor (closest, not just self)", () => {
    const button = document.createElement("button");
    const span = document.createElement("span");
    button.appendChild(span);
    expect(isInteractiveTarget(span)).toBe(true);
  });
});

describe("hoverStep", () => {
  it("equals the raw α at one 60fps frame from rest toward a hit", () => {
    expect(hoverStep(0, true, 1 / 60)).toBeCloseTo(HOVER_ALPHA, 12);
  });

  it("holds at rest when there is no hit", () => {
    expect(hoverStep(0, false, 1 / 60)).toBe(0);
  });

  it("rises toward 1 while hit and falls toward 0 while not", () => {
    let up = 0;
    for (let i = 0; i < 240; i++) up = hoverStep(up, true, 1 / 60);
    expect(up).toBeGreaterThan(0.95);
    let down = 1;
    for (let i = 0; i < 240; i++) down = hoverStep(down, false, 1 / 60);
    expect(down).toBeLessThan(0.05);
  });

  it("is framerate-normalized: 2×(dt/2) ≈ 1×dt", () => {
    const one = hoverStep(0, true, 1 / 60);
    const two = hoverStep(hoverStep(0, true, 1 / 120), true, 1 / 120);
    expect(two).toBeCloseTo(one, 4);
  });
});
