/**
 * JPY → THB using tiers from `jpy_thb_rate_tiers` (in-memory cache).
 * Falls back to `jpyToBahtFallback` from shared when cache empty or no tier matches.
 */

import { prisma } from "../../packages/database/src";
import { jpyToBahtFallback } from "../../packages/shared/src";

type CachedTier = {
  min_jpy: number;
  max_jpy: number | null;
  rate: number;
};

let cachedTiers: CachedTier[] = [];

export async function reloadJpyThbTiers(): Promise<void> {
  const rows = await prisma.jpyThbRateTier.findMany({
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
  });
  cachedTiers = rows.map((r) => ({
    min_jpy: r.min_jpy,
    max_jpy: r.max_jpy,
    rate: Number(r.rate),
  }));
}

/**
 * Half-open intervals: [min_jpy, max_jpy) or [min_jpy, ∞) when max_jpy is null.
 */
export function jpyToBaht(jpy: number | null | undefined): number | null {
  if (jpy == null || isNaN(jpy)) return null;
  const j = jpy;
  for (const t of cachedTiers) {
    if (j >= t.min_jpy && (t.max_jpy == null || j < t.max_jpy)) {
      return Math.ceil(j * t.rate);
    }
  }
  return jpyToBahtFallback(jpy);
}
