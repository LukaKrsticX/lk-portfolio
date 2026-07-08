"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { supportsWebGL } from "@/lib/gl-support";
import { detectTier, type Tier } from "@/lib/quality";

const Scene = dynamic(() => import("@/components/gl/Scene"), { ssr: false });

export function Experience() {
  const [booted, setBooted] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [gl, setGl] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!supportsWebGL()) return;
    setGl(true);
    detectTier().then(setTier).catch(() => setTier("low"));
  }, []);

  const showScene = booted && gl && !reduced && tier !== null;

  return (
    <>
      {!booted && <Loader onDone={() => setBooted(true)} />}
      {showScene && <Scene tier={tier} />}
    </>
  );
}
