import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

import { BookingLink } from "./BookingLink";

describe("BookingLink", () => {
  it("renders the booking anchor and fires booking_click", () => {
    render(<BookingLink url="https://cal.com/lk/intro" />);
    const link = screen.getByRole("link", { name: /book a call/i });
    expect(link).toHaveAttribute("href", "https://cal.com/lk/intro");
    fireEvent.click(link);
    expect(captureMock).toHaveBeenCalledWith("booking_click");
  });
});
