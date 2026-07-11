"use client";
import Lenis from "lenis";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { debugFlag } from "@/lib/debug-flags";
import {
  getSceneLive, lenisRef, measureScrollMetrics, scrollState, subscribeSceneLive,
} from "@/lib/scroll";
import { useMediaQuery } from "@/lib/use-media-query";

/** True for plain left-clicks on same-page hash anchors only. Exported for tests. */
export function isPlainHashClick(e: MouseEvent, a: HTMLAnchorElement | null): a is HTMLAnchorElement {
  return (
    a !== null &&
    e.button === 0 &&
    !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
    a.getAttribute("href")?.startsWith("#") === true
  );
}

export function SmoothScroll() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const scrollOn = useMemo(() => debugFlag("scroll"), []);
  const sceneLive = useSyncExternalStore(subscribeSceneLive, getSceneLive, () => false);

  // Always-on scroll plumbing: metrics + the single progress input. One code
  // path for Lenis (its programmatic writes fire native scroll events) and
  // native/touch scrolling alike. window.scrollY is a cached offset — no reflow.
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

  // Lenis lives ONLY while the canvas lives (decision 3): its wheel listeners
  // are passive:false — an alive Lenis with no rAF feed freezes the page.
  const smooth = sceneLive && !reduced && !coarse && scrollOn;
  useEffect(() => {
    if (!smooth) return;
    // Lerp only — duration/easing would abandon lerp mode (ONE smoothing source).
    const lenis = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true, syncTouch: false });
    lenisRef.current = lenis; // RafBridge feeds lenis.raf from R3F's loop
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (!isPlainHashClick(e, a)) return;
      const hash = a.getAttribute("href")!;
      const target = hash === "#" ? null : document.getElementById(hash.slice(1));
      if (!target) return;
      e.preventDefault();
      // Guarded: native fragment navigation adds no duplicate entries either.
      if (location.hash !== hash) history.pushState(null, "", hash);
      target.focus({ preventScroll: true }); // spec: activating nav moves focus
      lenis.scrollTo(target);
    };
    // Back/forward mid-glide: Lenis ignores external scrolls while
    // isScrolling==="smooth". `reset()` (which kills the glide and snaps
    // targetScroll/animatedScroll to the actual position) is private in the
    // public API — stop()+start() reaches it via the same internal path
    // (internalStop/internalStart both call this.reset()) so the browser's
    // traversal restore lands, without depending on a private method (decision 14).
    const onPop = () => {
      lenis.stop();
      lenis.start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
      lenisRef.current = null;
      lenis.destroy(); // removes wheel/touch listeners + html classes
    };
  }, [smooth]);

  return null;
}
