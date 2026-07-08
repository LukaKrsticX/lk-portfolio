"use client";
import { useEffect, useRef, useState } from "react";

const CAP_MS = 1500;
const STEP_MS = 30;
const GLYPHS = "/357>";

export function Loader({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const done = useRef(false);

  const finish = () => {
    if (!done.current) {
      done.current = true;
      onDone();
    }
  };

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + Math.ceil(100 / (CAP_MS / STEP_MS)));
        if (next >= 100) {
          clearInterval(id);
          finish();
        }
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noise = Array.from({ length: 24 }, (_, i) => GLYPHS[(i + progress) % GLYPHS.length]).join("");

  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        position: "absolute", inset: 0, zIndex: 20, background: "var(--bg)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
      }}
    >
      <span className="mono" aria-hidden="true">{noise}</span>
      <span className="mono">/{String(progress).padStart(2, "0")}</span>
      <button
        onClick={finish}
        className="mono"
        style={{ background: "none", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 16px", color: "var(--text-dim)", cursor: "pointer" }}
      >
        Skip intro
      </button>
    </div>
  );
}
