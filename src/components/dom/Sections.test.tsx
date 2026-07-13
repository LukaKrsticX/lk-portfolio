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
  it("renders the agencies extended copy (stack, turnaround, handoff)", () => {
    render(<Sections />);
    expect(screen.getByText(/Webflow, Next\.js\/React/)).toBeInTheDocument();
    expect(screen.getByText(/Fixed quote/)).toBeInTheDocument();
    expect(screen.getByText(/runbook/)).toBeInTheDocument();
  });
  it("contact section renders the form (button + status region)", () => {
    render(<Sections />);
    const button = screen.getByRole("button", { name: site.form.submitLabel });
    expect(button.closest("section")?.id).toBe("contact");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("agencies card links to the /agencies one-pager", () => {
    render(<Sections />);
    expect(screen.getByRole("link", { name: /one-pager for agencies/i })).toHaveAttribute(
      "href",
      "/agencies",
    );
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
  it("nav wraps on narrow viewports (ledger: <360px overflow)", () => {
    render(<Nav />);
    expect(screen.getByRole("navigation")).toHaveStyle({ flexWrap: "wrap" });
  });
  it("case cards carry a concise aria-label (ledger)", () => {
    render(<Sections />);
    for (const c of site.cases) {
      expect(screen.getByRole("link", { name: new RegExp(c.title, "i") })).toHaveAttribute(
        "aria-label",
        `${c.title} — ${c.role}. Opens live site.`,
      );
    }
  });
  it("every section is a programmatic focus target (tabIndex -1)", () => {
    render(<Sections />);
    for (const id of ["hero", "services", "work", "process", "about", "contact"]) {
      expect(document.getElementById(id)).toHaveAttribute("tabindex", "-1");
    }
  });
});
