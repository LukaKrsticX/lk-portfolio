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
