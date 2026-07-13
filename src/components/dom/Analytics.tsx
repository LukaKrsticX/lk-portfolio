"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { capture } from "@/lib/analytics";

// Per hard pageload (module scope) — SPA nav must not re-fire a seen scene.
const seenScenes = new Set<string>();

/** Fires page_view / agencies_page_view / scene_reached. Renders nothing. */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    capture("page_view", { path: pathname });
    if (pathname === "/agencies") capture("agencies_page_view");

    // scene_reached: once per section per pageload, half the section visible.
    const sections = document.querySelectorAll("section[id]");
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting && !seenScenes.has(id)) {
            seenScenes.add(id);
            capture("scene_reached", { scene: id });
          }
        }
      },
      { threshold: 0.5 },
    );
    for (const s of sections) io.observe(s);
    return () => io.disconnect();
  }, [pathname]);

  return null;
}

export function resetScenesForTests(): void {
  seenScenes.clear();
}
