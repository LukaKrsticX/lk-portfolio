import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { site } from "@/content/site";
import { Nav } from "./Nav";
import { Sections } from "./Sections";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("DOM layer", () => {
  it("renders all six anchored sections from the content module", () => {
    render(<Sections />);
    for (const id of ["hero", "services", "work", "process", "about", "contact"]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    expect(screen.getByText(site.positioning)).toBeInTheDocument();
  });
  it("renders one work card per case (scalable)", () => {
    render(<Sections />);
    for (const c of site.cases) {
      expect(screen.getByRole("link", { name: new RegExp(escapeRegExp(c.title), "i") })).toHaveAttribute("href", c.url);
    }
  });
  it("nav is a real <nav> with hash links that resolve to rendered sections", () => {
    render(<Nav />);
    render(<Sections />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact/i })).toHaveAttribute("href", "#contact");
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      expect(href).toMatch(/^#/);
      expect(document.getElementById(href.slice(1))).toBeInTheDocument();
    }
  });
});
