/**
 * @file currency.util.ts
 * @description JPY to THB conversion
 * @module @sakura/shared/utils
 *
 * Rate: 0.26 (default), 0.265 if JPY < 1200
 * ปัดเศษขึ้นเสมอ (Math.ceil)
 */

export function jpyToBaht(jpy: number | null | undefined): number | null {
  if (jpy == null || isNaN(jpy)) return null
  const rate = jpy < 1200 ? 0.265 : 0.26
  return Math.ceil(jpy * rate)
}
