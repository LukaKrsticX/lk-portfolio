"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { SceneBoundary } from "@/components/gl/SceneBoundary";
import { supportsWebGL } from "@/lib/gl-support";
import { detectTier, type Tier } from "@/lib/quality";
import { useMediaQuery } from "@/lib/use-media-query";

const Scene = dynamic(() => import("@/components/gl/Scene"), { ssr: false });

export function Experience() {
  const [booted, setBooted] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    if (!supportsWebGL()) return;
    detectTier().then(setTier).catch(() => setTier("low"));
  }, []);

  // tier !== null implies supportsWebGL() passed (detectTier only runs then).
  const showScene = booted && !reduced && tier !== null;

  return (
    <>
      {!booted && !reduced && <Loader onDone={() => setBooted(true)} />}
      {showScene && (
        <SceneBoundary>
          <Scene tier={tier} />
        </SceneBoundary>
      )}
    </>
  );
}
