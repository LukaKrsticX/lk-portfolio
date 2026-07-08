import { describe, expect, it } from "vitest";
import { site } from "./site";

describe("content module", () => {
  it("has meta, positioning and contact email", () => {
    expect(site.meta.title.length).toBeGreaterThan(0);
    expect(site.meta.description.length).toBeGreaterThan(20);
    expect(site.positioning).toContain("stand behind");
    expect(site.contact.email).toMatch(/@/);
  });
  it("has exactly 3 services with copy", () => {
    expect(site.services).toHaveLength(3);
    for (const s of site.services) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(10);
    }
  });
  it("cases are uniform and complete (scalability contract)", () => {
    expect(site.cases.length).toBeGreaterThanOrEqual(1);
    for (const c of site.cases) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.story.broken.length).toBeGreaterThan(10);
      expect(c.story.did.length).toBeGreaterThan(10);
      expect(c.story.result.length).toBeGreaterThan(10);
      expect(c.url).toMatch(/^https:\/\//);
      expect(c.capture).toMatch(/^\/cases\//);
      expect(c.tags.length).toBeGreaterThan(0);
    }
    const slugs = site.cases.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("bans agency buzzwords everywhere", () => {
    const text = JSON.stringify(site).toLowerCase();
    for (const w of ["leverage", "seamless", "unlock", "empower", "passionate"]) {
      expect(text).not.toContain(w);
    }
  });
});
