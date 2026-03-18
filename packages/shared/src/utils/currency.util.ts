/**
 * @file currency.util.ts
 * @description JPY to THB conversion and baht rounding
 * @module @sakura/shared/utils
 *
 * Rate: 0.26 (default), 0.265 if JPY < 1200
 * ปัดเศษขึ้นเสมอ (Math.ceil)
 *
 * เงินบาท: ถ้ามีทศนิยมปัดขึ้นทั้งหมด (เช่น 1000.1 → 1001)
 */

export function jpyToBaht(jpy: number | null | undefined): number | null {
  if (jpy == null || isNaN(jpy)) return null
  const rate = jpy < 1200 ? 0.265 : 0.26
  return Math.ceil(jpy * rate)
}

/** ปัดเศษบาทขึ้น: ถ้ามีทศนิยมปัดขึ้นทั้งหมด (เช่น 1000.1 → 1001) */
export function bahtRoundUp(amount: number): number {
  return Math.ceil(amount)
}
