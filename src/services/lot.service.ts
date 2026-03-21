/**
 * @file lot.service.ts
 * @description Lot business logic — shared by cron and on-demand triggers
 * @module @sakura/api/services
 */

import { prisma } from '../../packages/database/src'

const LOT_CODE_REGEX = /^LOT(\d+)$/i

function getStartOfToday(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function getStartOfNextDay(date: Date): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function parseLotNumber(lotCode: string): number | null {
  const match = lotCode.trim().match(LOT_CODE_REGEX)
  if (!match) return null
  return parseInt(match[1], 10)
}

/**
 * Ensures the next lot exists for the given intl_shipping_type.
 * Creates it if the last ended lot has end_lot_at < today and the next lot does not exist.
 * Idempotent: no-op if next lot already exists.
 * @returns { created: boolean } — true if a new lot was created
 */
export async function ensureNextLotExists(intlShippingType: 'air' | 'sea'): Promise<{ created: boolean; lotCode?: string }> {
  const today = getStartOfToday()

  const lastEndedLot = await prisma.lot.findFirst({
    where: {
      intl_shipping_type: intlShippingType,
      end_lot_at: { not: null, lt: today },
    },
    orderBy: { id: 'desc' },
  })

  let nextNumber = 1
  if (lastEndedLot && lastEndedLot.end_lot_at) {
    const num = parseLotNumber(lastEndedLot.lot_code)
    if (num != null) nextNumber = num + 1
  }

  const newLotCode = `LOT${nextNumber}`

  const exists = await prisma.lot.findUnique({
    where: {
      lot_code_intl_shipping_type: {
        lot_code: newLotCode,
        intl_shipping_type: intlShippingType,
      },
    },
  })

  if (exists) return { created: false }

  const start_lot_at = lastEndedLot?.end_lot_at
    ? getStartOfNextDay(lastEndedLot.end_lot_at)
    : today

  await prisma.lot.create({
    data: {
      lot_code: newLotCode,
      intl_shipping_type: intlShippingType,
      start_lot_at,
      end_lot_at: null,
      arrive_at: null,
    },
  })

  return { created: true, lotCode: newLotCode }
}
