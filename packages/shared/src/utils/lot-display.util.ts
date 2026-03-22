/**
 * Thai lot label for check-status / UI: LOTn(ตัดรอบ…/ถึงไทยประมาณ…), optional ล่าช้า** prefix.
 * Month abbreviations align with excel-import parsing (src/services/excel-import.service.ts).
 */

const THAI_MONTH_ABBR = [
  "ม.ค.",
  "ก.พ.",
  "มีนา",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const

function bangkokDayAndMonth(date: Date): { day: number; monthAbbr: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
  const parts = formatter.formatToParts(date)
  const dayStr = parts.find((p) => p.type === "day")?.value
  const monthStr = parts.find((p) => p.type === "month")?.value
  const day = dayStr ? parseInt(dayStr, 10) : NaN
  const monthNum = monthStr ? parseInt(monthStr, 10) : NaN
  const monthAbbr =
    monthNum >= 1 && monthNum <= 12 ? THAI_MONTH_ABBR[monthNum - 1] : ""
  return { day, monthAbbr }
}

export type FormatLotDisplayInput = {
  lotCode: string | null | undefined
  endLotAt: Date | null | undefined
  arriveAt: Date | null | undefined
  isDelayed: boolean
}

/**
 * Returns null if no lot code.
 * If both cut-off and ETA dates are set: full Thai label.
 * Otherwise: lot code only (with ล่าช้า** when delayed).
 */
export function formatLotDisplay(input: FormatLotDisplayInput): string | null {
  const code = (input.lotCode ?? "").trim()
  if (!code) return null

  const cut =
    input.endLotAt != null
      ? bangkokDayAndMonth(input.endLotAt)
      : null
  const eta =
    input.arriveAt != null ? bangkokDayAndMonth(input.arriveAt) : null

  const cutOk =
    cut != null &&
    Number.isFinite(cut.day) &&
    cut.monthAbbr !== ""
  const etaOk =
    eta != null && Number.isFinite(eta.day) && eta.monthAbbr !== ""

  if (cutOk && etaOk) {
    const body = `${code}(ตัดรอบ${cut.day}${cut.monthAbbr}/ถึงไทยประมาณ${eta.day}${eta.monthAbbr})`
    return input.isDelayed ? `ล่าช้า**${body}` : body
  }

  return input.isDelayed ? `ล่าช้า**${code}` : code
}
