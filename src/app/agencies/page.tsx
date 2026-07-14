import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: site.agenciesMeta.title,
  description: site.agenciesMeta.description,
};

/** Forwardable one-pager — plain DOM, no canvas/virtual scroll, safe to paste into Slack. */
export default function AgenciesPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <header>
        <p className="mono">
          <Link href="/">← back to site</Link>
        </p>
        <p className="mono" style={{ marginTop: "2rem" }}>For agencies — one-pager</p>
        <h1 style={{ marginTop: 8 }}>{site.positioning}</h1>
        <p className="mono" style={{ marginTop: 8 }}>{site.meta.title}</p>
      </header>

      <section style={{ marginTop: "3rem" }}>
        <h2>What I do</h2>
        <div className="grid" style={{ marginTop: "1rem" }}>
          {site.services.map((s) => (
            <div className="card" key={s.key}>
              <h3 style={{ fontWeight: 500, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ color: "var(--text-dim)" }}>{s.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2>How I work with agencies</h2>
        <div className="card" style={{ marginTop: "1rem" }}>
          <p style={{ color: "var(--text-dim)" }}>{site.agencies.whiteLabel}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{site.agencies.timezone}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{site.agencies.cadence}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{site.agencies.capacity}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{site.agencies.stack}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{site.agencies.turnaround}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{site.agencies.handoff}</p>
          <p style={{ marginTop: 8 }}>{site.agencies.mapping}</p>
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2>Selected work</h2>
        <div className="grid" style={{ marginTop: "1rem" }}>
          {site.cases.map((c) => (
            <div className="card" key={c.slug}>
              <p className="mono">{c.role} · {c.year}</p>
              <h3 style={{ fontWeight: 500, margin: "8px 0" }}>{c.title}</h3>
              <p style={{ color: "var(--text-dim)" }}>{c.story.result}</p>
              <p style={{ marginTop: 8 }}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.url.replace("https://", "")}
                </a>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2>Contact</h2>
        <p style={{ marginTop: "1rem" }}>
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
        </p>
        <p style={{ marginTop: 8 }}>
          <Link href="/#contact">Start a conversation →</Link>
        </p>
        <p className="mono" style={{ marginTop: 8 }}>{site.contact.privacyNote}</p>
      </section>
    </main>
  );
}
