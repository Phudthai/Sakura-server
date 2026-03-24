/**
 * @file currency.util.ts
 * @description Baht rounding; legacy JPY→THB fallback (when DB tiers unavailable)
 * @module @sakura/shared/utils
 *
 * เงินบาท: ถ้ามีทศนิยมปัดขึ้นทั้งหมด (เช่น 1000.1 → 1001)
 *
 * Production conversion uses `jpyToBaht` from `src/services/exchange-rate.service.ts` (DB tiers per air/sea).
 */

/** Legacy default when tiers not loaded: 0.265 if JPY &lt; 1200 else 0.26 — same as original hardcoded behavior */
export function jpyToBahtFallback(jpy: number | null | undefined): number | null {
  if (jpy == null || isNaN(jpy)) return null
  const rate = jpy < 1200 ? 0.265 : 0.26
  return Math.ceil(jpy * rate)
}

/** ปัดเศษบาทขึ้น: ถ้ามีทศนิยมปัดขึ้นทั้งหมด (เช่น 1000.1 → 1001) */
export function bahtRoundUp(amount: number): number {
  return Math.ceil(amount)
}
