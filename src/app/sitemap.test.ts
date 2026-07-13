import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists the home page and /agencies", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(2);
    const urls = entries.map((e) => e.url);
    expect(urls[0]).not.toMatch(/\/agencies/);
    expect(urls[1]).toMatch(/\/agencies$/);
  });
});
