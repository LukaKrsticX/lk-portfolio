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

export const TIER_ORDER: readonly Tier[] = ["low", "med", "high"];

export function clampTier(tier: Tier, cap: Tier | null): Tier {
  if (cap === null) return tier;
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(cap) ? tier : cap;
}

export function demoteTier(tier: Tier): Tier {
  return TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(tier) - 1)];
}

const TIER_CAP_KEY = "lk-tier-cap";
const TIER_CAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function readTierCap(now: number = Date.now()): Tier | null {
  try {
    const raw = localStorage.getItem(TIER_CAP_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { tier, ts } = parsed as { tier?: unknown; ts?: unknown };
    if (typeof ts !== "number" || now - ts > TIER_CAP_TTL_MS) return null;
    return tier === "low" || tier === "med" || tier === "high" ? tier : null;
  } catch {
    return null;
  }
}

export function persistTierCap(tier: Tier, now: number = Date.now()): void {
  try {
    localStorage.setItem(TIER_CAP_KEY, JSON.stringify({ tier, ts: now }));
  } catch {
    // storage unavailable (private mode) — demotion still applies this session
  }
}
