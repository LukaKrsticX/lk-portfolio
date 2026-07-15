import Link from "next/link";
import { BookingLink } from "@/components/dom/BookingLink";
import { ContactForm } from "@/components/dom/ContactForm";
import { DecodeText } from "@/components/dom/DecodeText";
import { site } from "@/content/site";
import type { SiteContent } from "@/content/types";
import { STAGGER_MS } from "@/lib/decode";

const contact: SiteContent["contact"] = site.contact;

export function Sections() {
  return (
    <main>
      <section id="hero" tabIndex={-1}>
        <p className="mono">Luka Krstić — creative developer</p>
        <h1>{site.positioning}</h1>
        <p className="mono" style={{ marginTop: "2rem" }}>Belgrade — UK +1h · US-East +6h</p>
      </section>

      <section id="services" tabIndex={-1}>
        <h2><DecodeText>Services</DecodeText></h2>
        <div className="grid">
          {site.services.map((s) => (
            <div className="card" key={s.key}>
              <h3 style={{ fontWeight: 500, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ color: "var(--text-dim)" }}>{s.blurb}</p>
            </div>
          ))}
        </div>
        <div className="card" style={{ marginTop: "1rem" }}>
          <p className="mono" style={{ marginBottom: 8 }}>For agencies</p>
          <p style={{ color: "var(--text-dim)" }}>
            {site.agencies.whiteLabel} {site.agencies.timezone} {site.agencies.cadence} {site.agencies.capacity}
          </p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
            {site.agencies.stack} {site.agencies.turnaround} {site.agencies.handoff}
          </p>
          <p className="mono" style={{ marginTop: 8 }}>
            <Link href="/agencies">One-pager for agencies →</Link>
          </p>
        </div>
      </section>

      <section id="work" tabIndex={-1}>
        <h2><DecodeText>Selected work</DecodeText></h2>
        <div className="grid">
          {site.cases.map((c, i) => (
            <a
              className="card"
              key={c.slug}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`${c.title} — ${c.role}. Opens live site.`}
            >
              <p className="mono">{c.role} · {c.year}</p>
              <h3 style={{ fontWeight: 500, margin: "8px 0" }}>
                <DecodeText delay={i * STAGGER_MS}>{c.title}</DecodeText>
              </h3>
              <p style={{ color: "var(--text-dim)" }}>{c.story.broken}</p>
              <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{c.story.did}</p>
              <p style={{ marginTop: 8 }}>{c.story.result}</p>
            </a>
          ))}
        </div>
      </section>

      <section id="process" tabIndex={-1}>
        <h2><DecodeText>Process</DecodeText></h2>
        <p style={{ color: "var(--text-dim)" }}>Audit → fix → stand behind. {site.agencies.mapping}</p>
      </section>

      <section id="about" tabIndex={-1}>
        <h2><DecodeText>About</DecodeText></h2>
        <p style={{ color: "var(--text-dim)" }}>{site.about}</p>
      </section>

      <section id="contact" tabIndex={-1}>
        <h2><DecodeText>Contact</DecodeText></h2>
        <ContactForm />
        <p style={{ marginTop: "1.5rem" }}>
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
        </p>
        {contact.bookingUrl && (
          <p style={{ marginTop: 8 }}>
            <BookingLink url={contact.bookingUrl} />
          </p>
        )}
        <p className="mono" style={{ marginTop: 8 }}>{site.contact.privacyNote}</p>
      </section>
    </main>
  );
}
