"use client";
import { capture } from "@/lib/analytics";

/** Booking CTA — rendered only when site.contact.bookingUrl exists (Cal.com decision). */
export function BookingLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={() => capture("booking_click")}>
      Book a call →
    </a>
  );
}
