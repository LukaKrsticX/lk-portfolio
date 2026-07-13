import { describe, expect, it } from "vitest";
import { site } from "./site";
import type { SiteContent } from "./types";

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
  it("agencies block is complete (every field carries real copy)", () => {
    for (const v of Object.values(site.agencies)) {
      expect(v.length).toBeGreaterThan(10);
    }
  });
  it("agencies one-pager meta + form copy present", () => {
    expect(site.agenciesMeta.title.toLowerCase()).toContain("agencies");
    expect(site.agenciesMeta.description.length).toBeGreaterThan(20);
    for (const v of Object.values(site.form)) {
      expect(v.length).toBeGreaterThan(0);
    }
  });
  it("booking link ships absent until the Cal.com decision", () => {
    const c: SiteContent = site;
    expect(c.contact.bookingUrl).toBeUndefined();
  });
  it("bans agency buzzwords everywhere", () => {
    const text = JSON.stringify(site).toLowerCase();
    for (const w of ["leverage", "seamless", "unlock", "empower", "passionate"]) {
      expect(text).not.toContain(w);
    }
  });
});
