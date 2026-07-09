"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
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
    if (!supportsWebGL()) return;
    const override = debugTier();
    if (override !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot debug override
      setTier(override);
      return;
    }
    detectTier()
      .then((t) => setTier(clampTier(t, readTierCap())))
      .catch(() => setTier("low"));
  }, []);

  // Demote one step and persist (7-day cap) — never promote at runtime.
  const handleDemote = useCallback(() => {
    setTier((t) => {
      if (t === null || t === "low") return t;
      const demoted = demoteTier(t);
      persistTierCap(demoted);
      return demoted;
    });
  }, []);

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
