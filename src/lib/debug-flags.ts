import type { Tier } from "./quality";

function search(explicit?: string): string {
  if (explicit !== undefined) return explicit;
  return typeof location === "undefined" ? "" : location.search;
}

/** `?name=0` disables a feature; anything else (or absence) keeps it on. */
export function debugFlag(name: string, searchOverride?: string): boolean {
  return new URLSearchParams(search(searchOverride)).get(name) !== "0";
}

/** `?tier=low|med|high` forces a tier (soak-test bisection); otherwise null. */
export function debugTier(searchOverride?: string): Tier | null {
  const t = new URLSearchParams(search(searchOverride)).get("tier");
  return t === "low" || t === "med" || t === "high" ? t : null;
}

/** `?name=<choice>` picks a staged variant; absence or an unlisted value → null (control). */
export function debugChoice<T extends string>(
  name: string,
  choices: readonly T[],
  searchOverride?: string,
): T | null {
  const v = new URLSearchParams(search(searchOverride)).get(name);
  return choices.includes(v as T) ? (v as T) : null;
}
