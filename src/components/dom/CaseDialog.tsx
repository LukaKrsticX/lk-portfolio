"use client";
// DOM side of the case portal. NEVER import "@react-three/fiber" or src/components/gl/* here — this
// is first-load DOM and must stay off the GL bundle. It talks to the GL layer only through
// src/lib/portal-store.ts (the portal bus).
import { type CSSProperties, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { site } from "@/content/site";
import { debugFlag } from "@/lib/debug-flags";
import {
  closePortal,
  getPortalServerView,
  getPortalView,
  navigatePortal,
  openPortal,
  type PortalView,
  subscribePortal,
} from "@/lib/portal-store";
import { getSceneLive, scrollMode, subscribeSceneLive } from "@/lib/scroll";
import { useMediaQuery } from "@/lib/use-media-query";

const CASE_HASH = "#case-";

function slugFromHash(): string | null {
  if (typeof location === "undefined") return null;
  const h = location.hash;
  return h.startsWith(CASE_HASH) ? h.slice(CASE_HASH.length) : null;
}
function indexOfSlug(slug: string): number {
  return site.cases.findIndex((c) => c.slug === slug);
}
function scrollToWork(): void {
  document.getElementById("work")?.scrollIntoView();
}

/** Focusable descendants in tab order (the heading is tabindex -1 → excluded). */
function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
}

function DialogPanel({ view }: { view: PortalView }) {
  const c = site.cases[view.index];
  const n = site.cases.length;
  const prevIndex = (view.index - 1 + n) % n;
  const nextIndex = (view.index + 1) % n;
  const titleId = "case-dialog-title";
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Mount-once: capture the source focus, hand-rolled focus trap (Tab cycle + Esc), restore focus on
  // unmount. Unmount happens when the store sets slug→null (close), so focus returns to the source.
  useEffect(() => {
    const source = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePortal("esc");
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(panelRef.current);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panelRef.current?.contains(active);
      if (e.shiftKey) {
        if (active === first || active === headingRef.current || outside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      source?.focus?.();
    };
  }, []);

  // Focus the heading on open AND whenever prev/next swaps the case (view.slug changes).
  useEffect(() => {
    headingRef.current?.focus();
  }, [view.slug]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={panelRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8vh 8vw",
        // Scrim for legibility; the GL case backdrop renders behind (canvas is z-index −1). The
        // scrim is translucent so the wipe/backdrop reads through — "DOM text over the GL backdrop".
        background: "radial-gradient(120% 120% at 50% 40%, rgba(4,5,7,0.35), rgba(4,5,7,0.82))",
      }}
    >
      <div style={{ maxWidth: 620, width: "100%" }}>
        <button
          type="button"
          onClick={() => closePortal("esc")}
          aria-label="Close case"
          style={{
            position: "absolute",
            top: "3vh",
            right: "4vw",
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 8,
            color: "var(--text)",
            width: 40,
            height: 40,
            fontSize: 20,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <p className="mono">{`${c.role} · ${c.year}`}</p>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} style={{ outline: "none", margin: "8px 0 1.25rem" }}>
          {c.title}
        </h2>

        <p style={{ color: "var(--text-dim)", marginBottom: 12 }}>{c.story.broken}</p>
        <p style={{ color: "var(--text-dim)", marginBottom: 12 }}>{c.story.did}</p>
        <p style={{ marginBottom: "1.75rem" }}>{c.story.result}</p>

        <p style={{ marginBottom: "1.75rem" }}>
          <a href={c.url} target="_blank" rel="noreferrer">
            Visit live ↗
          </a>
        </p>

        <nav aria-label="Cases" style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => navigatePortal(prevIndex)} className="mono" style={navBtn}>
            ← {site.cases[prevIndex].title}
          </button>
          <button type="button" onClick={() => navigatePortal(nextIndex)} className="mono" style={navBtn}>
            {site.cases[nextIndex].title} →
          </button>
        </nav>
      </div>
    </div>
  );
}

const navBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--text-dim)",
  padding: "8px 12px",
  cursor: "pointer",
};

/**
 * Portal case-detail dialog. Mounts into <body> (over the GL backdrop) only while a case is open in
 * the store. Owns the history contract: popstate closes an open portal (Back-to-close) or opens a
 * deep-linked case when virtual mode is live; on load a `#case-<slug>` deep link fast-opens (GL) or
 * plainly scrolls to #work (native/reduced — the DOM cards stay external links, parity unchanged).
 * `?portal=0` renders nothing.
 */
export function CaseDialog() {
  const enabled = useMemo(() => debugFlag("portal"), []);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const scrollOn = useMemo(() => debugFlag("scroll"), []);
  const view = useSyncExternalStore(subscribePortal, getPortalView, getPortalServerView);
  const sceneLive = useSyncExternalStore(subscribeSceneLive, getSceneLive, () => false);
  // Native (non-virtual) contexts: the portal never engages — deep links just scroll to #work.
  const nativeMode = reduced || coarse || !scrollOn;

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const trySync = (): void => {
      const slug = slugFromHash();
      if (!slug) return;
      const idx = indexOfSlug(slug);
      if (idx < 0) return;
      if (scrollMode.virtual) {
        if (getPortalView().slug === null) openPortal(idx, "pop", { fast: true });
      } else if (nativeMode) {
        scrollToWork(); // native/reduced deep link — no dialog
      }
      // else: GL still coming up (not native, virtual not yet on) — the sceneLive dep re-runs this.
    };
    trySync();
    // One deferred retry beats the VirtualScroll-takeover ordering on the sceneLive tick.
    raf = requestAnimationFrame(trySync);

    const onPop = (): void => {
      if (getPortalView().slug !== null) {
        closePortal("pop"); // browser already navigated away from #case-x
        return;
      }
      const slug = slugFromHash();
      if (slug && scrollMode.virtual) {
        const idx = indexOfSlug(slug);
        if (idx >= 0) openPortal(idx, "pop", { fast: true });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("popstate", onPop);
    };
  }, [enabled, sceneLive, nativeMode]);

  if (!enabled || view.slug === null) return null;
  return createPortal(<DialogPanel view={view} />, document.body);
}
