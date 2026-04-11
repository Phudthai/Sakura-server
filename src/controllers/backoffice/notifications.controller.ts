/**
 * @file notifications.controller.ts
 * @description Backoffice alert counts for polling (slips, pending bids, incomplete lot dates).
 */

import type { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'

/** Same as lot.controller: only lots that have at least one PR with weight. */
const lotWhereHasWeightGram: Prisma.LotWhereInput = {
  purchase_requests: {
    some: { weight_gram: { gt: 0 } },
  },
}

const lotMissingEndLotAt = (shipping: 'air' | 'sea'): Prisma.LotWhereInput => ({
  intl_shipping_type: shipping,
  ...lotWhereHasWeightGram,
  end_lot_at: null,
})

const lotMissingArriveAt = (shipping: 'air' | 'sea'): Prisma.LotWhereInput => ({
  intl_shipping_type: shipping,
  ...lotWhereHasWeightGram,
  arrive_at: null,
})

/**
 * GET /api/backoffice/notifications/summary
 * Counts only; safe to poll every few minutes.
 */
export async function getNotificationsSummary(_req: Request, res: Response) {
  const [
    pendingSlips,
    pendingBids,
    lotsMissingEndAir,
    lotsMissingEndSea,
    lotsMissingArriveAir,
    lotsMissingArriveSea,
  ] = await Promise.all([
    prisma.paymentReceipt.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.auctionPriceLog.count({ where: { status: 'pending' } }),
    prisma.lot.count({ where: lotMissingEndLotAt('air') }),
    prisma.lot.count({ where: lotMissingEndLotAt('sea') }),
    prisma.lot.count({ where: lotMissingArriveAt('air') }),
    prisma.lot.count({ where: lotMissingArriveAt('sea') }),
  ])

  return res.json({
    success: true,
    data: {
      pendingSlips,
      pendingBids,
      lotsMissingEndLotAt: {
        air: lotsMissingEndAir,
        sea: lotsMissingEndSea,
      },
      lotsMissingArriveAt: {
        air: lotsMissingArriveAir,
        sea: lotsMissingArriveSea,
      },
    },
  })
}
