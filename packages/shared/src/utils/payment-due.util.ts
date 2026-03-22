/**
 * Intl payment due dates (Bangkok calendar) — same rules as enduser check-status.
 * bought_at from DB as timestamptz: use UTC components as Bangkok wall-clock (see check-status).
 */

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Due date for PRODUCT_FULL + INTL_SHIPPING (YYYY-MM-DD).
 * Air: 10 calendar days after Bangkok date of bought_at.
 * Sea: 20th of the calendar month after the month of bought_at (Bangkok).
 */
export function calcIntlDueDateYmd(boughtAt: Date, transport: "air" | "sea"): string {
  const year = boughtAt.getUTCFullYear()
  const month = boughtAt.getUTCMonth()
  const day = boughtAt.getUTCDate()

  let dueYear: number
  let dueMonth: number
  let dueDay: number
  if (transport === "air") {
    const d = new Date(Date.UTC(year, month, day + 10))
    dueYear = d.getUTCFullYear()
    dueMonth = d.getUTCMonth() + 1
    dueDay = d.getUTCDate()
  } else {
    dueYear = month === 11 ? year + 1 : year
    dueMonth = month === 11 ? 1 : month + 2
    dueDay = 20
  }
  return `${dueYear}-${String(dueMonth).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`
}

/** Today's date in Bangkok as YYYY-MM-DD (for comparing to due dates). */
export function bangkokTodayYmd(): string {
  const bkk = new Date(Date.now() + BANGKOK_OFFSET_MS)
  const y = bkk.getUTCFullYear()
  const m = bkk.getUTCMonth() + 1
  const d = bkk.getUTCDate()
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}
