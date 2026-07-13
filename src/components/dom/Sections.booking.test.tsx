import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SiteContent } from "@/content/types";

vi.mock("@/lib/analytics", () => ({ capture: vi.fn() }));

// Real content ships bookingUrl absent; this suite proves the wiring is live
// the moment the operator adds the URL (Cal.com decision).
vi.mock("@/content/site", async (importOriginal) => {
  const actual = await importOriginal<{ site: SiteContent }>();
  return {
    site: {
      ...actual.site,
      contact: { ...actual.site.contact, bookingUrl: "https://cal.com/lk/intro" },
    },
  };
});

import { Sections } from "./Sections";

describe("Sections with bookingUrl present", () => {
  it("renders the booking link in the contact section", () => {
    render(<Sections />);
    const link = screen.getByRole("link", { name: /book a call/i });
    expect(link).toHaveAttribute("href", "https://cal.com/lk/intro");
    expect(link.closest("section")?.id).toBe("contact");
  });
});
