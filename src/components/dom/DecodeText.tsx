"use client";
// Digit-decode heading text (spec §7). Wraps section h2s + case titles: the real string lives in
// aria-label (the enclosing heading takes its accessible name from it, so SR reads the real title
// even while the visible span scrambles), the animation lives in an aria-hidden span. Triggered
// once per load per element on first section-enter via IntersectionObserver — works in BOTH scroll
// modes (native + virtual), because it observes VISUAL intersection, not scroll position. All
// time-math is in lib/decode.ts (unit-tested); this only owns the 15fps interval + a11y wrapper.
import { useEffect, useRef, useState } from "react";
import { debugFlag } from "@/lib/debug-flags";
import { decodeDuration, FRAME_MS, renderDecode } from "@/lib/decode";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * `delay` staggers elements entering together (case titles pass index·STAGGER_MS). The wrapper
 * structure is STABLE across SSR/hydration (always the same two spans showing the real text) so
 * hydration never mismatches; the scramble is a post-mount state update. prefers-reduced-motion
 * OR `?decode=0` → no observer, no interval: the real text sits inert (still accessible).
 */
export function DecodeText({ children, delay = 0 }: { children: string; delay?: number }) {
  const text = children;
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const wrapRef = useRef<HTMLSpanElement>(null);
  // null = show the real text (mount, stagger hold, settle, and the inert path all render `text`);
  // a string = the current scramble frame. Rendering `scramble ?? text` keeps the inert path a pure
  // no-op (no setState in the effect body) and hydration-stable (SSR + first client render = text).
  const [scramble, setScramble] = useState<string | null>(null);

  useEffect(() => {
    // Inert path: reduced-motion / ?decode=0 / no IO → static real text, no observer, no interval.
    if (reduced || !debugFlag("decode") || typeof IntersectionObserver === "undefined") return;
    const el = wrapRef.current;
    if (!el) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let started = false;
    const dur = decodeDuration(text.length);

    const run = (): void => {
      if (started) return;
      started = true;
      // First non-held tick lands at elapsed=0 (fully scrambled), then advances one 15fps frame
      // per tick. `delay` holds the real text until this element's stagger slot opens.
      let elapsed = -delay - FRAME_MS;
      interval = setInterval(() => {
        elapsed += FRAME_MS;
        if (elapsed < 0) return; // stagger hold — scramble stays null → real text shows
        if (elapsed >= dur) {
          setScramble(null); // settle to the real text
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        setScramble(renderDecode(text, elapsed));
      }, FRAME_MS);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            obs.disconnect(); // once per load per element — never re-arm
            run();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (interval) clearInterval(interval);
    };
  }, [reduced, text, delay]);

  return (
    <span ref={wrapRef} aria-label={text}>
      <span aria-hidden="true">{scramble ?? text}</span>
    </span>
  );
}
