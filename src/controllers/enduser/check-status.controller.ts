/**
 * @file check-status.controller.ts
 * @description Enduser check status — products, summary, receiptId by month+transportType
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import { Prisma } from '@prisma/client'
import { bahtRoundUp } from '../../../packages/shared/src'

const BANGKOK_TZ = 'Asia/Bangkok'
const SHIPPING_RATE_AIR = 0.59
const SHIPPING_RATE_SEA = 0.35

function mapTransportType(t: string): string | null {
  const s = (t || '').toLowerCase()
  if (s === 'ship' || s === 'sea') return 'sea'
  if (s === 'airplane' || s === 'air') return 'air'
  return null
}

function parseMonthParam(monthParam: string, yearParam?: string): { month: number; year: number } | null {
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

export async function getCheckStatus(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const parsed = parseMonthParam(req.query.month as string, req.query.year as string)
  if (!parsed) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_MONTH', message: 'Valid month (1-12) or year-month (e.g. 2026-3) required' },
    })
  }
  const { month, year } = parsed
  const transportTypeRaw = req.query.transportType as string
  const transportType = mapTransportType(transportTypeRaw)
  if (!transportType) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSPORT_TYPE', message: 'transportType must be "ship" or "airplane"' } })
  }

  const auctionRequests = await prisma.$queryRaw<
    { id: number; title: string | null; "imageUrl": string | null; current_price: number | null; current_price_baht: number | null; weight_gram: number | null; intl_shipping_type: string | null; lot_code: string | null }[]
  >(Prisma.sql`
    SELECT ar.id, ar.title, ar."imageUrl", ar."currentPrice" AS current_price, ar.current_price_baht, ar.weight_gram, ar.intl_shipping_type, l.lot_code
    FROM auction_requests ar
    LEFT JOIN lots l ON ar.lot_id = l.id
    WHERE ar."userId" = ${userId}
      AND ar.bought_at IS NOT NULL
      AND ar.intl_shipping_type = ${transportType}
      AND EXTRACT(MONTH FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${month}
      AND EXTRACT(YEAR FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${year}
    ORDER BY ar.bought_at ASC
  `)

  if (auctionRequests.length === 0) {
    const [user, receipt] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { username: true, userCode: true } }),
      prisma.paymentReceipt.findFirst({
        where: {
          userId,
          month,
          transportType,
          OR: [{ year }, { year: null }],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return res.json({
      success: true,
      data: {
        month: String(month),
        year: String(year),
        transportType: transportType === 'sea' ? 'ship' : 'airplane',
        user: {
          username: user?.username ?? '',
          customerId: user?.userCode ?? '',
        },
        summary: { totalBaht: 0, paid: 0, outstanding: 0 },
        receiptId: receipt?.id ?? null,
        products: [],
      },
    })
  }

  const arIds = auctionRequests.map((ar) => ar.id)

  const obligations = await prisma.paymentObligation.findMany({
    where: {
      auctionRequestId: { in: arIds },
      obligationType: { code: { in: ['PRODUCT_FULL', 'INTL_SHIPPING'] } },
    },
    include: {
      obligationType: true,
      auctionRequest: true,
      transactions: { select: { amount: true } },
    },
  })

  const receipt = await prisma.paymentReceipt.findFirst({
    where: {
      userId,
      month,
      transportType,
      OR: [{ year }, { year: null }],
    },
    orderBy: { createdAt: 'desc' },
  })

  const obByAr = new Map<number, typeof obligations>()
  for (const ob of obligations) {
    if (ob.auctionRequestId) {
      const list = obByAr.get(ob.auctionRequestId) || []
      list.push(ob)
      obByAr.set(ob.auctionRequestId, list)
    }
  }

  const arrivedAtJapanArIds = new Set(
    (
      await prisma.deliveryStage.findMany({
        where: {
          auctionRequestId: { in: arIds },
          stageTypeId: 1,
          status: 'DELIVERED',
        },
        select: { auctionRequestId: true },
      })
    ).map((s) => s.auctionRequestId),
  )

  const shippingRate = transportType === 'air' ? SHIPPING_RATE_AIR : SHIPPING_RATE_SEA

  const products = auctionRequests.map((ar) => {
    const arObs = obByAr.get(ar.id) || []
    const productOb = arObs.find((o) => o.obligationType.code === 'PRODUCT_FULL')
    const shippingOb = arObs.find((o) => o.obligationType.code === 'INTL_SHIPPING')
    const productPaid = productOb ? productOb.transactions.reduce((s, t) => s + t.amount, 0) : 0
    const shippingPaid = shippingOb ? shippingOb.transactions.reduce((s, t) => s + t.amount, 0) : 0
    const shipShippingCost =
      (ar.weight_gram ?? 0) > 0
        ? bahtRoundUp((ar.weight_gram ?? 0) * shippingRate)
        : (shippingOb?.amount ?? 0)

    return {
      id: `ar-${ar.id}`,
      auctionRequestId: ar.id,
      name: ar.title ?? 'Unknown',
      imageUrl: ar.imageUrl ?? null,
      yen: ar.current_price ?? 0,
      baht: ar.current_price_baht ?? 0,
      grams: ar.weight_gram ?? 0,
      shipShippingCost,
      paid: productPaid + shippingPaid,
      shipRound: ar.lot_code ?? null,
      arrivedAtJapan: arrivedAtJapanArIds.has(ar.id),
    }
  })

  const totalBaht = products.reduce((s, p) => s + p.baht + p.shipShippingCost, 0)
  const paid = products.reduce((s, p) => s + p.paid, 0)
  const outstanding = totalBaht - paid

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, userCode: true },
  })

  return res.json({
    success: true,
    data: {
      month: String(month),
      year: String(year),
      transportType: transportType === 'sea' ? 'ship' : 'airplane',
      user: {
        username: user?.username ?? '',
        customerId: user?.userCode ?? '',
      },
      summary: {
        totalBaht,
        paid,
        outstanding,
      },
      receiptId: receipt?.id ?? null,
      products,
    },
  })
}

export async function getMonths(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const rows = await prisma.$queryRaw<{ month: number; year: number }[]>(Prisma.sql`
    SELECT DISTINCT
      EXTRACT(MONTH FROM bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ})::int AS month,
      EXTRACT(YEAR FROM bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ})::int AS year
    FROM auction_requests
    WHERE "userId" = ${userId}
      AND bought_at IS NOT NULL
    ORDER BY year DESC, month DESC
  `)

  const months = rows.map((r) => `${r.year}-${r.month}`)

  return res.json({
    success: true,
    data: { months },
  })
}
