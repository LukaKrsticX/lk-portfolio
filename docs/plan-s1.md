# LK Portfolio — S1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the deployable foundation of the LK portfolio: Next.js app with typed content module, server-rendered DOM layer, instant ASCII loader, quality-tier detection, R3F canvas shell with WebGL-failure fallback, CI with an enforced JS budget, live on Vercel.

**Architecture:** One Next.js App Router page; a typed content module is the single source of truth feeding a semantic server-rendered DOM layer (SEO/a11y/fallback) and, later, the WebGL scenes. The R3F bundle is dynamic-imported behind a DOM/CSS loader so first paint is instant. Quality tiers decide GPU work; every WebGL failure path lands on the readable DOM page.

**Tech Stack:** Next.js 15 (App Router, TS strict), React Three Fiber + drei + three, detect-gpu, CSS Modules, vitest + @testing-library/react (jsdom), pnpm, GitHub Actions, Vercel free tier.

**Spec:** `CCX/docs/superpowers/specs/2026-07-08-lk-portfolio-design.md` (v2.1). This plan covers slice **S1 only**; S2–S6 get their own plans after S1 ships.

**Repo location:** `C:\Users\L\Desktop\lk-portfolio` (NEW standalone repo — NOT inside CCX). All paths below are relative to it. Shell examples are Git-Bash.

---

### Task 1: Repo bootstrap

**Files:**
- Create: entire scaffold via create-next-app

- [x] **Step 1: Scaffold**

```bash
cd /c/Users/L/Desktop
pnpm create next-app@latest lk-portfolio --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*"
cd lk-portfolio
```
Expected: scaffold created, `pnpm dev` runs on :3000.

- [x] **Step 2: Dependencies**

```bash
pnpm add three @react-three/fiber @react-three/drei detect-gpu
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @types/three
```

- [x] **Step 3: vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Create `vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

- [x] **Step 4: Sanity run**

```bash
pnpm test
```
Expected: "No test files found" exit 0 (or passWithNoTests warning — add `passWithNoTests: true` to the test config).

- [x] **Step 5: Init git + GitHub + first commit**

```bash
git init -b main && git add -A && git commit -m "chore: scaffold next.js app with vitest"
gh repo create lk-portfolio --public --source . --push
```
Expected: repo visible on GitHub. (Public — the site will link to GitHub as proof.)

---

### Task 2: Typed content module (single source of truth)

**Files:**
- Create: `src/content/types.ts`
- Create: `src/content/site.ts`
- Test: `src/content/site.test.ts`

- [x] **Step 1: Write the failing test**

`src/content/site.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { site } from "./site";

describe("content module", () => {
  it("has meta, positioning and contact email", () => {
    expect(site.meta.title.length).toBeGreaterThan(0);
    expect(site.meta.description.length).toBeGreaterThan(20);
    expect(site.positioning).toContain("stand behind");
    expect(site.contact.email).toMatch(/@/);
  });
  it("has exactly 3 services with copy", () => {
    expect(site.services).toHaveLength(3);
    for (const s of site.services) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(10);
    }
  });
  it("cases are uniform and complete (scalability contract)", () => {
    expect(site.cases.length).toBeGreaterThanOrEqual(1);
    for (const c of site.cases) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.story.broken.length).toBeGreaterThan(10);
      expect(c.story.did.length).toBeGreaterThan(10);
      expect(c.story.result.length).toBeGreaterThan(10);
      expect(c.url).toMatch(/^https:\/\//);
      expect(c.capture).toMatch(/^\/cases\//);
      expect(c.tags.length).toBeGreaterThan(0);
    }
  });
  it("bans agency buzzwords everywhere", () => {
    const text = JSON.stringify(site).toLowerCase();
    for (const w of ["leverage", "seamless", "unlock", "empower", "passionate"]) {
      expect(text).not.toContain(w);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
pnpm test
```
Expected: FAIL — cannot resolve `./site`.

- [x] **Step 3: Implement types**

`src/content/types.ts`:
```ts
export interface CaseStudy {
  slug: string;
  title: string;
  role: string;
  year: string;
  story: { broken: string; did: string; result: string };
  url: string;
  capture: string;
  tags: string[];
}

export interface Service {
  key: "rescue" | "build" | "automation";
  title: string;
  blurb: string;
}

export interface SiteContent {
  meta: { title: string; description: string };
  positioning: string;
  services: Service[];
  agencies: {
    whiteLabel: string;
    timezone: string;
    cadence: string;
    capacity: string;
    mapping: string;
  };
  cases: CaseStudy[];
  about: string;
  contact: { email: string; privacyNote: string };
}
```

- [x] **Step 4: Implement content (real v0 copy, EN)**

`src/content/site.ts`:
```ts
import type { SiteContent } from "./types";

export const site: SiteContent = {
  meta: {
    title: "Luka Krstić — creative developer",
    description:
      "I build, rescue and stand behind websites in the AI era. Webflow and code, from Belgrade, working with US/UK agencies.",
  },
  positioning: "I build, rescue and stand behind websites in the AI era.",
  services: [
    {
      key: "rescue",
      title: "AI-site rescue",
      blurb:
        "Sites started with AI tools and abandoned at 80%. I finish the last mile: broken links, forms, tracking, performance — and I stand behind the result.",
    },
    {
      key: "build",
      title: "Premium builds",
      blurb:
        "Webflow or code, built to be maintained. Semantic, fast, measured from day one.",
    },
    {
      key: "automation",
      title: "Automation & AI integrations",
      blurb:
        "Forms that reach inboxes, reports that write themselves, AI where it earns its keep — not where it demos well.",
    },
  ],
  agencies: {
    whiteLabel: "White-label by default. NDA-friendly. Your client never sees my name.",
    timezone: "Belgrade: UK +1h, US-East +6h — same-day overlap with both.",
    cadence: "Reply within one business day. No disappearing acts.",
    capacity: "Solo, deliberately. One or two agency engagements at a time.",
    mapping: "This site was built solo, end to end — the same discipline goes into your client work.",
  },
  cases: [
    {
      slug: "holimed",
      title: "Holimed Tim",
      role: "Build + rescue",
      year: "2020–2026",
      story: {
        broken:
          "Three of four homepage service cards led fresh visitors to a 404 — the links pointed at a dead www host.",
        did: "Repointed every card and button to the live host, cleaned staging leftovers and the malformed title tag.",
        result: "Every service reachable again; the clinic's site stopped leaking patients to error pages.",
      },
      url: "https://holimedtim.com",
      capture: "/cases/holimed.webp",
      tags: ["Webflow", "rescue", "healthcare"],
    },
    {
      slug: "cea",
      title: "CEA Medic",
      role: "Design + build",
      year: "2025",
      story: {
        broken: "A Belgrade clinic with no web presence for a modern diagnostics offer.",
        did: "Designed and shipped the full site on Webflow — structure, copy direction, visual system.",
        result: "Sold at a premium through referral; the clinic's primary digital storefront.",
      },
      url: "https://cea.rs",
      capture: "/cases/cea.webp",
      tags: ["Webflow", "build", "healthcare"],
    },
  ],
  about:
    "Luka Krstić. IT masters student and working developer in Belgrade. I ship with modern AI tooling and take responsibility for what it produces.",
  contact: {
    email: "lukakrstic2002@gmail.com",
    privacyNote: "Your name and email are used only to reply. No lists, no marketing.",
  },
};
```

- [x] **Step 5: Run tests, expect PASS, commit**

```bash
pnpm test
git add src/content vitest.config.ts vitest.setup.ts && git commit -m "feat: typed content module — single source of truth"
```

---

### Task 3: Global styles + DOM layer

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css` (replace scaffold content)
- Create: `src/components/dom/Sections.tsx`
- Create: `src/components/dom/Nav.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/dom/Sections.test.tsx`

- [x] **Step 1: Write the failing test**

`src/components/dom/Sections.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { site } from "@/content/site";
import { Nav } from "./Nav";
import { Sections } from "./Sections";

describe("DOM layer", () => {
  it("renders all six anchored sections from the content module", () => {
    render(<Sections />);
    for (const id of ["hero", "services", "work", "process", "about", "contact"]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    expect(screen.getByText(site.positioning)).toBeInTheDocument();
  });
  it("renders one work card per case (scalable)", () => {
    render(<Sections />);
    for (const c of site.cases) {
      expect(screen.getByRole("link", { name: new RegExp(c.title, "i") })).toHaveAttribute("href", c.url);
    }
  });
  it("nav is a real <nav> with hash links usable before WebGL exists", () => {
    render(<Nav />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact/i })).toHaveAttribute("href", "#contact");
  });
});
```

- [x] **Step 2: Run to verify FAIL** (`pnpm test` — cannot resolve `./Sections`)

- [x] **Step 3: Implement**

`src/app/globals.css` (replace entirely):
```css
:root {
  --bg: #040507;
  --text: #e8f4ff;
  --text-dim: #5d8db0;
  --accent: #4da6e8;
  --line: #1d3242;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; background: var(--bg); }
body {
  color: var(--text);
  font-family: var(--font-display), system-ui, sans-serif;
  min-height: 100vh;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.mono { font-family: var(--font-mono), monospace; letter-spacing: 0.15em; font-size: 11px; color: var(--text-dim); text-transform: uppercase; }
section { min-height: 60vh; padding: 12vh 8vw; max-width: 1100px; margin: 0 auto; }
h1 { font-size: clamp(28px, 5vw, 56px); line-height: 1.15; font-weight: 500; }
h2 { font-size: clamp(20px, 3vw, 32px); font-weight: 500; margin-bottom: 1.5rem; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 1.5rem; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { site } from "@/content/site";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: site.meta.title,
  description: site.meta.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

`src/components/dom/Nav.tsx`:
```tsx
import { site } from "@/content/site";

const ITEMS = [
  { href: "#work", label: "Work" },
  { href: "#services", label: "Services" },
  { href: "#contact", label: "Contact" },
];

export function Nav() {
  return (
    <nav
      aria-label="Main"
      style={{
        position: "sticky", top: 16, zIndex: 10, display: "flex", gap: 20,
        justifyContent: "flex-end", padding: "8px 24px",
      }}
    >
      <span className="mono" style={{ marginRight: "auto" }}>{site.meta.title}</span>
      {ITEMS.map((i) => (
        <a key={i.href} href={i.href} className="mono">{i.label}</a>
      ))}
    </nav>
  );
}
```

`src/components/dom/Sections.tsx`:
```tsx
import { site } from "@/content/site";

export function Sections() {
  return (
    <main>
      <section id="hero">
        <p className="mono">Luka Krstić — creative developer</p>
        <h1>{site.positioning}</h1>
        <p className="mono" style={{ marginTop: "2rem" }}>Belgrade — UK +1h · US-East +6h</p>
      </section>

      <section id="services">
        <h2>Services</h2>
        <div className="grid">
          {site.services.map((s) => (
            <div className="card" key={s.key}>
              <h3 style={{ fontWeight: 500, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ color: "var(--text-dim)" }}>{s.blurb}</p>
            </div>
          ))}
        </div>
        <div className="card" style={{ marginTop: "1rem" }}>
          <p className="mono" style={{ marginBottom: 8 }}>For agencies</p>
          <p style={{ color: "var(--text-dim)" }}>
            {site.agencies.whiteLabel} {site.agencies.timezone} {site.agencies.cadence} {site.agencies.capacity}
          </p>
        </div>
      </section>

      <section id="work">
        <h2>Selected work</h2>
        <div className="grid">
          {site.cases.map((c) => (
            <a className="card" key={c.slug} href={c.url} target="_blank" rel="noreferrer">
              <p className="mono">{c.role} · {c.year}</p>
              <h3 style={{ fontWeight: 500, margin: "8px 0" }}>{c.title}</h3>
              <p style={{ color: "var(--text-dim)" }}>{c.story.broken}</p>
              <p style={{ color: "var(--text-dim)", marginTop: 8 }}>{c.story.did}</p>
              <p style={{ marginTop: 8 }}>{c.story.result}</p>
            </a>
          ))}
        </div>
      </section>

      <section id="process">
        <h2>Process</h2>
        <p style={{ color: "var(--text-dim)" }}>Audit → fix → stand behind. {site.agencies.mapping}</p>
      </section>

      <section id="about">
        <h2>About</h2>
        <p style={{ color: "var(--text-dim)" }}>{site.about}</p>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
        </p>
        <p className="mono" style={{ marginTop: 8 }}>{site.contact.privacyNote}</p>
      </section>
    </main>
  );
}
```

`src/app/page.tsx`:
```tsx
import { Nav } from "@/components/dom/Nav";
import { Sections } from "@/components/dom/Sections";

export default function Home() {
  return (
    <>
      <Nav />
      <Sections />
    </>
  );
}
```

- [x] **Step 4: Run tests (PASS) + eyeball**

```bash
pnpm test && pnpm dev
```
Expected: tests pass; http://localhost:3000 shows a readable dark page — this exact page is also the noscript/no-WebGL/reduced-motion fallback.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: server-rendered DOM layer — six anchored sections from content module"
```

---

### Task 4: ASCII loader (DOM/CSS, capped, skippable)

**Files:**
- Create: `src/components/Loader.tsx`
- Test: `src/components/Loader.test.tsx`

- [x] **Step 1: Write the failing test**

`src/components/Loader.test.tsx`:
```tsx
import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Loader } from "./Loader";

describe("Loader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls onDone within the 1.5s cap", () => {
    const onDone = vi.fn();
    render(<Loader onDone={onDone} />);
    act(() => vi.advanceTimersByTime(1600));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skip button fires onDone immediately", () => {
    const onDone = vi.fn();
    render(<Loader onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run to verify FAIL** (`pnpm test` — cannot resolve `./Loader`)

- [x] **Step 3: Implement**

`src/components/Loader.tsx`:
```tsx
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
```

- [x] **Step 4: Run tests (PASS)**, **Step 5: Commit**

```bash
pnpm test
git add src/components/Loader.tsx src/components/Loader.test.tsx && git commit -m "feat: capped skippable ASCII loader (DOM/CSS)"
```

---

### Task 5: WebGL support check + quality tiers

**Files:**
- Create: `src/lib/gl-support.ts`
- Create: `src/lib/quality.ts`
- Test: `src/lib/quality.test.ts`

- [x] **Step 1: Write the failing test**

`src/lib/quality.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { supportsWebGL } from "./gl-support";
import { detectTier, heuristicTier } from "./quality";

describe("supportsWebGL", () => {
  it("returns false when getContext yields null (jsdom default)", () => {
    expect(supportsWebGL()).toBe(false);
  });
});

describe("heuristicTier", () => {
  it("low on small memory", () => {
    expect(heuristicTier({ deviceMemory: 2, hardwareConcurrency: 4 } as never)).toBe("low");
  });
  it("med on mid hardware", () => {
    expect(heuristicTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never)).toBe("med");
  });
  it("high on strong hardware", () => {
    expect(heuristicTier({ deviceMemory: 16, hardwareConcurrency: 16 } as never)).toBe("high");
  });
});

describe("detectTier", () => {
  it("falls back to heuristic when detect-gpu throws", async () => {
    vi.mock("detect-gpu", () => ({ getGPUTier: () => Promise.reject(new Error("blocked")) }));
    const tier = await detectTier({ deviceMemory: 8, hardwareConcurrency: 8 } as never);
    expect(["low", "med", "high"]).toContain(tier);
  });
});
```

- [x] **Step 2: Run to verify FAIL**

- [x] **Step 3: Implement**

`src/lib/gl-support.ts`:
```ts
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
```

`src/lib/quality.ts`:
```ts
import { getGPUTier } from "detect-gpu";

export type Tier = "high" | "med" | "low";

type NavLike = Pick<Navigator, "hardwareConcurrency"> & { deviceMemory?: number };

export function heuristicTier(nav: NavLike): Tier {
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  if (mem <= 4 || cores <= 4) return "low";
  if (mem >= 16 && cores >= 12) return "high";
  return "med";
}

export async function detectTier(nav: NavLike = navigator): Promise<Tier> {
  try {
    const gpu = await getGPUTier();
    if (gpu.tier >= 3) return "high";
    if (gpu.tier === 2) return "med";
    return "low";
  } catch {
    return heuristicTier(nav);
  }
}

export const DPR_CAP: Record<Tier, number> = { high: 1.5, med: 1.25, low: 1 };
```

- [x] **Step 4: Run tests (PASS)**, **Step 5: Commit**

```bash
pnpm test
git add src/lib && git commit -m "feat: webgl support check + quality tier detection with heuristic fallback"
```

---

### Task 6: R3F canvas shell with failure fallback

**Files:**
- Create: `src/components/gl/Scene.tsx`
- Create: `src/components/gl/Starfield.tsx`
- Create: `src/components/Experience.tsx`
- Modify: `src/app/page.tsx`

Note: WebGL does not run in jsdom — this task is verified manually + by the existing DOM tests still passing (the DOM layer must remain untouched when GL fails).

- [x] **Step 1: Placeholder starfield (replaced by the real hero in S2)**

`src/components/gl/Starfield.tsx`:
```tsx
"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Points } from "three";

export function Starfield({ count = 800 }: { count?: number }) {
  const ref = useRef<Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() - 0.5) * 12;
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#4da6e8" sizeAttenuation transparent opacity={0.7} />
    </points>
  );
}
```

- [x] **Step 2: Scene wrapper**

`src/components/gl/Scene.tsx`:
```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import type { Tier } from "@/lib/quality";
import { DPR_CAP } from "@/lib/quality";
import { Starfield } from "./Starfield";

export default function Scene({ tier }: { tier: Tier }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1 }}>
      <Canvas
        dpr={[1, DPR_CAP[tier]]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
        }}
      >
        <Starfield count={tier === "low" ? 300 : 800} />
      </Canvas>
    </div>
  );
}
```

- [x] **Step 3: Experience orchestrator (loader → tier → scene; every failure path = DOM stays)**

`src/components/Experience.tsx`:
```tsx
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
```

- [x] **Step 4: Mount in page**

`src/app/page.tsx`:
```tsx
import { Nav } from "@/components/dom/Nav";
import { Sections } from "@/components/dom/Sections";
import { Experience } from "@/components/Experience";

export default function Home() {
  return (
    <>
      <Experience />
      <Nav />
      <Sections />
    </>
  );
}
```

- [x] **Step 5: Verify manually + tests still green**

```bash
pnpm test && pnpm dev
```
Expected: loader plays ≤1.5s (skippable), starfield drifts behind the DOM sections; with DevTools → Rendering → "Emulate prefers-reduced-motion" the scene never mounts and the page stays fully readable; `pnpm test` all green.

- [x] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: r3f canvas shell behind loader with tier dpr caps and failure fallbacks"
```

---

### Task 7: SEO baseline (sitemap, robots, hash anchors already in place)

**Files:**
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

- [x] **Step 1: Implement**

`src/app/sitemap.ts`:
```ts
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lukakrstic.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: BASE, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
```

`src/app/robots.ts`:
```ts
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lukakrstic.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${BASE}/sitemap.xml` };
}
```

- [x] **Step 2: Verify + commit**

```bash
pnpm build
```
Expected: build succeeds; `/sitemap.xml` and `/robots.txt` listed in the route table.

```bash
git add src/app/sitemap.ts src/app/robots.ts && git commit -m "feat: sitemap and robots via metadata api"
```

---

### Task 8: CI with enforced JS budget

**Files:**
- Create: `scripts/check-budget.mjs`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (script)

- [ ] **Step 1: Budget script**

`scripts/check-budget.mjs`:
```js
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT_KB = 550;
const manifest = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));
const files = manifest.pages["/page"] ?? [];
let total = 0;
for (const f of files) {
  if (f.endsWith(".js")) total += gzipSync(readFileSync(`.next/${f}`)).length;
}
const kb = total / 1024;
console.log(`first-load js (gz): ${kb.toFixed(1)}KB / limit ${LIMIT_KB}KB`);
if (kb > LIMIT_KB) {
  console.error("BUDGET EXCEEDED");
  process.exit(1);
}
```

Add script: `"budget": "node scripts/check-budget.mjs"`.

- [ ] **Step 2: Run locally**

```bash
pnpm build && pnpm budget
```
Expected: prints a number well under 550KB (S1 has no heavy scenes yet — likely ~150–250KB) and exits 0. Record the number in the commit message.

- [ ] **Step 3: GitHub Action**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  test-build-budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - run: pnpm budget
```

- [ ] **Step 4: Commit + verify Action goes green on GitHub**

```bash
git add -A && git commit -m "ci: vitest + build + enforced 550KB first-load budget" && git push
```
Expected: the `ci` workflow passes on GitHub within a few minutes.

---

### Task 9: Deploy to Vercel + live verification

**Files:** none (config on Vercel side)

- [ ] **Step 1 (OPERATOR, one-time, ~3 min):** vercel.com → Add New → Project → Import `lk-portfolio` from GitHub → framework auto-detected (Next.js) → Deploy. Set project name `lukakrstic` if the subdomain is free.

- [ ] **Step 2: Live smoke checklist**

- URL loads over HTTPS; dark DOM page readable.
- Loader plays once, Skip works.
- Starfield visible on a WebGL-capable browser.
- `view-source:` shows real content (h1 positioning line, case cards) — SEO layer confirmed.
- `/sitemap.xml`, `/robots.txt` respond.
- Phone check: page readable, no horizontal scroll.

- [ ] **Step 3: Record the live URL in CCX**

In CCX repo: add the URL + S1-done note to `projects/claude-income-venture/_index.md` pending items (CCX session does this, not this repo).

---

## Self-review (run after writing, fixed inline)

1. **Spec coverage (S1 scope):** content module ✓ (Task 2), DOM layer ✓ (3), loader ✓ (4), tiers ✓ (5), canvas shell + failure paths ✓ (6), SEO baseline ✓ (7), CI budget ✓ (8), deploy ✓ (9). Deferred by design to later slices: hero monogram/ribbon/ripple (S2), scenes + /agencies (S3), form + analytics (S4), post/perf/a11y passes (S5), captures/OG/launch checklist (S6).
2. **Placeholder scan:** all code blocks complete; copy in Task 2 is real v0 copy (refined in S6); Starfield explicitly labeled as S2-replaceable placeholder — that is a real deliverable, not a TBD.
3. **Type consistency:** `Tier` type exported from `src/lib/quality.ts` and imported in Scene/Experience ✓; `site` shape matches `SiteContent` ✓; `DPR_CAP` record keyed by `Tier` ✓.
