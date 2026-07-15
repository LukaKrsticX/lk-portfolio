import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// S6 P6 budget lock (docs/plan-s6.md §6.4). Formula: ceil(measured + 0.15·(measured − 442.4) + 10),
// capped at 550. Measured 2026-07-15 at the end of P6 = 446.6KB gz → ceil(446.6 + 0.15·4.2 + 10)
// = ceil(457.23) = 458. Headroom (~11KB) absorbs minor post-merge drift without a re-baseline.
const LIMIT_KB = 458;

const gzKB = (buf) => gzipSync(buf).length / 1024;

// First-load JS (pre-interactive) from the app build manifest — reported, not enforced.
let firstLoad = null;
try {
  const manifest = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));
  const files = (manifest.pages["/page"] ?? []).filter((f) => f.endsWith(".js"));
  firstLoad = files.reduce((sum, f) => sum + gzKB(readFileSync(join(".next", f))), 0);
} catch {
  // manifest absent/shaped differently under some Turbopack versions — total below still enforces
}

// Enforced: every JS chunk the route can ever load, incl. the lazy GL chunk (three core).
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
const total = walk(".next/static/chunks").reduce((sum, f) => sum + gzKB(readFileSync(f)), 0);

if (firstLoad !== null) console.log(`first-load js (gz): ${firstLoad.toFixed(1)}KB`);
console.log(`total js incl. lazy gl chunk (gz): ${total.toFixed(1)}KB / limit ${LIMIT_KB}KB`);
if (total > LIMIT_KB) {
  console.error("BUDGET EXCEEDED");
  process.exit(1);
}
