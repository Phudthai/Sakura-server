/**
 * @file month.util.ts
 * @description Parse month param (1-12 or year-month e.g. 2026-3)
 */

export function parseMonthParam(
  monthParam: string,
  yearParam?: string,
): { month: number; year: number } | null {
  const s = (monthParam || '').trim()
  if (!s) return null
  const dash = s.indexOf('-')
  if (dash > 0) {
    const y = parseInt(s.slice(0, dash))
    const m = parseInt(s.slice(dash + 1))
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) return { month: m, year: y }
  }
  const m = parseInt(s)
  if (!isNaN(m) && m >= 1 && m <= 12) {
    const y = parseInt(yearParam || '') || new Date().getFullYear()
    return { month: m, year: y }
  }
  return null
}
