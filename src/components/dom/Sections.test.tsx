import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { site } from "@/content/site";
import { Nav } from "./Nav";
import { Sections } from "./Sections";

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
      expect(screen.getByRole("link", { name: new RegExp(c.title, "i") })).toHaveAttribute("href", c.url);
    }
  });
  it("nav is a real <nav> with hash links usable before WebGL exists", () => {
    render(<Nav />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact/i })).toHaveAttribute("href", "#contact");
  });
});
