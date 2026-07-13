import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { site } from "@/content/site";
import AgenciesPage, { metadata } from "./page";

describe("/agencies one-pager", () => {
  it("exports metadata from the content module", () => {
    expect(metadata.title).toBe(site.agenciesMeta.title);
    expect(metadata.description).toBe(site.agenciesMeta.description);
  });

  it("renders every agencies field verbatim (forwardable completeness)", () => {
    render(<AgenciesPage />);
    for (const v of Object.values(site.agencies)) {
      expect(screen.getByText(v, { exact: false })).toBeInTheDocument();
    }
  });

  it("renders services, both cases with live URLs, and contact", () => {
    render(<AgenciesPage />);
    for (const s of site.services) {
      expect(screen.getByText(s.title)).toBeInTheDocument();
    }
    for (const c of site.cases) {
      expect(screen.getByText(c.title)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: new RegExp(c.url.replace("https://", "")) });
      expect(link).toHaveAttribute("href", c.url);
    }
    expect(screen.getByRole("link", { name: site.contact.email })).toHaveAttribute(
      "href",
      `mailto:${site.contact.email}`,
    );
    expect(screen.getByText(site.contact.privacyNote)).toBeInTheDocument();
  });

  it("links back to the site and to /#contact; no canvas, no nav pills", () => {
    const { container } = render(<AgenciesPage />);
    expect(screen.getByRole("link", { name: /back to site/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /start a conversation/i })).toHaveAttribute(
      "href",
      "/#contact",
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });
});
