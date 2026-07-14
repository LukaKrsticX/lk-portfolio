"use client";
// NEVER import "@react-three/fiber" (or anything from src/components/gl/) here — it would pull fiber+three into the first-load chunk. GL side talks to us only via src/lib/scroll.ts.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { debugFlag } from "@/lib/debug-flags";
import {
  getSceneLive, measureScrollMetrics, pipelineRef, scrollMetrics, scrollMode, scrollState, subscribeSceneLive,
} from "@/lib/scroll";
import { useMediaQuery } from "@/lib/use-media-query";
import { createVirtualScroll } from "@/lib/virtual-scroll";

/** True for plain left-clicks on same-page hash anchors only. Exported for tests. */
export function isPlainHashClick(e: MouseEvent, a: HTMLAnchorElement | null): a is HTMLAnchorElement {
  return (
    a !== null &&
    e.button === 0 &&
    !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
    a.getAttribute("href")?.startsWith("#") === true
  );
}

/** Keydown targets that own their own scroll/caret — the virtual pipeline must not hijack them. */
function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Layout-space document top of an element via the offsetParent chain — transform-independent
 * (the #vs-root translate3d never moves offsetTop), so it is the one coordinate space where
 * anchor/focus/seed targets stay ABSOLUTE and compose idempotently with leak absorption.
 * Exported for tests.
 */
export function docTop(el: HTMLElement): number {
  let top = 0;
  let cur: Element | null = el;
  while (cur instanceof HTMLElement) {
    top += cur.offsetTop;
    cur = cur.offsetParent;
  }
  return top;
}

export function VirtualScroll() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const scrollOn = useMemo(() => debugFlag("scroll"), []);
  const sceneLive = useSyncExternalStore(subscribeSceneLive, getSceneLive, () => false);

  // Always-on scroll plumbing: metrics + the single native progress input. Runs in
  // every mode; in virtual mode the body is overflow:hidden so this fires only on our
  // own scrollTo (takeover/handback). window.scrollY is a cached offset — no reflow.
  useEffect(() => {
    measureScrollMetrics();
    scrollState.y = window.scrollY;
    const onScroll = () => {
      scrollState.y = window.scrollY;
    };
    let measureRaf = 0;
    const remeasure = () => {
      cancelAnimationFrame(measureRaf);
      measureRaf = requestAnimationFrame(measureScrollMetrics);
    };
    // ResizeObserver catches document-height changes that fire no window
    // resize (font swap settling, future S4 content). jsdom lacks RO — guard.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
    ro?.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", remeasure, { passive: true });
    return () => {
      cancelAnimationFrame(measureRaf);
      ro?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  // Virtual mode lives ONLY while the canvas lives (decision 3): the wheel listener is
  // passive:false, so a pipeline registered with no rAF feed would freeze the page — the
  // freeze-trap this predicate guards. RafBridge feeds frame() from R3F's loop.
  const smooth = sceneLive && !reduced && !coarse && scrollOn;
  useEffect(() => {
    if (!smooth) return;
    const root = document.getElementById("vs-root") as HTMLElement | null;

    // Takeover: capture the seed, zero the window scroll INSTANTLY (globals.css sets
    // `html { scroll-behavior: smooth }` — an unforced zero ANIMATES and races whatever
    // native scroll is in flight, stranding a partial offset under the transform), freeze
    // the body, flip to virtual mode and remeasure (maxScroll now reads #vs-root in
    // document space), THEN create the pipeline seeded against that authoritative max.
    // Deep links: on load the browser's own anchor scroll may still be animating, so
    // window.scrollY is a race-dependent lie — when a hash target exists, seed from its
    // layout position instead.
    const hashEl = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
    const seedY = hashEl ? docTop(hashEl) : window.scrollY;
    window.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.style.overflow = "hidden";
    scrollMode.virtual = true;
    measureScrollMetrics();
    const pipeline = createVirtualScroll({ max: scrollMetrics.maxScroll, y0: seedY });
    if (root) root.style.willChange = "transform";

    // Frame fn: dt from the addEffect timestamp (first frame seeded at 1/60). step → write
    // the store the whole GL layer reads → paint the transform (rounded to kill string churn).
    let prevT = 0;
    pipelineRef.current = {
      frame(tMs: number): void {
        const dt = prevT === 0 ? 1 / 60 : Math.min((tMs - prevT) / 1000, 1 / 30);
        prevT = tMs;
        pipeline.step(dt);
        const y = pipeline.y;
        scrollState.y = y;
        if (root) {
          const yr = Math.round(y * 100) / 100;
          root.style.transform = `translate3d(0, ${-yr}px, 0)`;
        }
      },
    };

    // overflow:hidden does NOT block programmatic/native scrolls (focus-reveal
    // scrollIntoView on Tab, browser anchor restores). Any nonzero window.scrollY STACKS
    // with the translate3d and throws content off-screen — pin it back to 0 instantly and
    // fold the leaked offset into the pipeline so the user still lands where the browser
    // meant to put them. absorb() is a no-op while a tween owns the destination (focusin's
    // target below is absolute, so an absorbed leak is never double-applied).
    const onNativeLeak = () => {
      const leaked = window.scrollY;
      if (leaked === 0) return;
      pipeline.absorb(leaked);
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    const PAGE = () => 0.85 * window.innerHeight;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // passive:false — we own the scroll
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      pipeline.applyWheel(e.deltaY * unit);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return; // the ContactForm lives inside #vs-root
      switch (e.key) {
        case " ": // Space / Shift+Space
          e.preventDefault();
          pipeline.tweenTo(pipeline.target + (e.shiftKey ? -PAGE() : PAGE()), 800);
          break;
        case "PageDown":
          e.preventDefault();
          pipeline.tweenTo(pipeline.target + PAGE(), 800);
          break;
        case "PageUp":
          e.preventDefault();
          pipeline.tweenTo(pipeline.target - PAGE(), 800);
          break;
        case "Home":
          e.preventDefault();
          pipeline.tweenTo(0, 800);
          break;
        case "End":
          e.preventDefault();
          pipeline.tweenTo(scrollMetrics.maxScroll, 800);
          break;
        case "ArrowDown":
          e.preventDefault();
          pipeline.nudge(60);
          break;
        case "ArrowUp":
          e.preventDefault();
          pipeline.nudge(-60);
          break;
      }
    };
    // Tab lands focus on an off-screen field → center it. The band check uses the VISUAL
    // rect; the tween target is layout-space (docTop) — absolute, not a rect delta, so it
    // composes idempotently with the scroll-pin absorb above regardless of event order.
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !root || !root.contains(el)) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      if (center < 0.15 * vh || center > 0.85 * vh) {
        pipeline.tweenTo(docTop(el) + el.offsetHeight / 2 - vh / 2, 500);
      }
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (!isPlainHashClick(e, a)) return;
      const hash = a.getAttribute("href")!;
      const target = hash === "#" ? null : document.getElementById(hash.slice(1));
      if (!target) return;
      e.preventDefault();
      if (location.hash !== hash) history.pushState(null, "", hash);
      target.focus({ preventScroll: true }); // spec: activating nav moves focus
      pipeline.tweenTo(docTop(target), 800); // layout-space — transform-independent
    };
    // Body never scrolls in virtual mode, so the browser can't restore a traversal
    // position — tween to the hash target (or top) ourselves.
    const onPop = () => {
      const hash = location.hash;
      const el = hash && hash !== "#" ? document.getElementById(hash.slice(1)) : null;
      pipeline.tweenTo(el ? docTop(el) : 0, 800);
    };

    window.addEventListener("scroll", onNativeLeak, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);

    // Handback: capture y, stop the rAF feed, drop the scroll pin BEFORE restoring (or it
    // would re-zero our own restore), unfreeze, clear the transform, and restore the exact
    // native offset — instantly, or CSS scroll-behavior:smooth animates the seam.
    return () => {
      const yNow = pipeline.y;
      pipelineRef.current = null;
      window.removeEventListener("scroll", onNativeLeak);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
      document.documentElement.style.overflow = "";
      scrollMode.virtual = false;
      if (root) {
        root.style.transform = "";
        root.style.willChange = "";
      }
      window.scrollTo({ top: yNow, behavior: "instant" });
    };
  }, [smooth]);

  return null;
}
