"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/Loader";
import { capture } from "@/lib/analytics";
import { SceneBoundary } from "@/components/gl/SceneBoundary";
import { debugTier } from "@/lib/debug-flags";
import { supportsWebGL } from "@/lib/gl-support";
import {
  clampTier,
  demoteTier,
  detectTier,
  persistTierCap,
  readTierCap,
  type Tier,
} from "@/lib/quality";
import { useMediaQuery } from "@/lib/use-media-query";

const Scene = dynamic(() => import("@/components/gl/Scene"), { ssr: false });

export function Experience() {
  const [booted, setBooted] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    if (!supportsWebGL()) {
      capture("webgl_fallback_triggered", { cause: "no-webgl" });
      return;
    }
    const override = debugTier();
    if (override !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot debug override
      setTier(override);
      capture("quality_tier_selected", { tier: override, cause: "initial" });
      return;
    }
    detectTier()
      .then((t) => {
        const settled = clampTier(t, readTierCap());
        setTier(settled);
        capture("quality_tier_selected", { tier: settled, cause: "initial" });
      })
      .catch(() => {
        setTier("low");
        capture("quality_tier_selected", { tier: "low", cause: "initial" });
      });
  }, []);

  // Demote one step and persist (7-day cap) — never promote at runtime.
  const handleDemote = useCallback(() => {
    setTier((t) => {
      if (t === null || t === "low") return t;
      const demoted = demoteTier(t);
      if (debugTier() === null) persistTierCap(demoted);
      return demoted;
    });
  }, []);

  // Demote analytics fire on the committed state change, not inside the updater
  // (updaters must stay pure; StrictMode double-invokes them).
  const prevTier = useRef<Tier | null>(null);
  useEffect(() => {
    if (tier !== null && prevTier.current !== null && tier !== prevTier.current) {
      capture("quality_tier_selected", { tier, cause: "demote" });
    }
    prevTier.current = tier;
  }, [tier]);

  // tier !== null implies supportsWebGL() passed (detectTier only runs then).
  const showScene = booted && !reduced && tier !== null;

  return (
    <>
      {!booted && !reduced && <Loader onDone={() => setBooted(true)} />}
      {showScene && (
        <SceneBoundary>
          <Scene tier={tier} onDemote={handleDemote} />
        </SceneBoundary>
      )}
    </>
  );
}
