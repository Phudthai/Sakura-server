/**
 * @file check-status.controller.ts
 * @description Enduser check status — products, summary, receiptId by month+transportType
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import { Prisma } from '@prisma/client'
import { bahtRoundUp } from '../../../packages/shared/src'
import { getDomesticShippingPendingItemsForUser } from '../../services/domestic-shipping.service'

const BANGKOK_TZ = 'Asia/Bangkok'
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const SHIPPING_RATE_AIR = 0.59
const SHIPPING_RATE_SEA = 0.35

function calcDueDate(boughtAt: Date, transport: 'air' | 'sea'): string {
  // $queryRaw returns timestamptz stored as +07:00 — the JS Date UTC components
  // already reflect Bangkok wall-clock time (no conversion needed)
  const year = boughtAt.getUTCFullYear()
  const month = boughtAt.getUTCMonth() // 0-indexed
  const day = boughtAt.getUTCDate()

  let dueYear: number, dueMonth: number, dueDay: number
  if (transport === 'air') {
    // 10 calendar days after Bangkok date; Date.UTC handles month/year overflow
    const d = new Date(Date.UTC(year, month, day + 10))
    dueYear = d.getUTCFullYear()
    dueMonth = d.getUTCMonth() + 1 // 1-indexed
    dueDay = d.getUTCDate()
  } else {
    // Sea: 20th of next month (Bangkok calendar)
    dueYear = month === 11 ? year + 1 : year
    dueMonth = month === 11 ? 1 : month + 2 // 1-indexed
    dueDay = 20
  }
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

function bangkokToday(): string {
  const bkk = new Date(Date.now() + BANGKOK_OFFSET_MS)
  const y = bkk.getUTCFullYear()
  const m = bkk.getUTCMonth() + 1
  const d = bkk.getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

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
    { id: number; title: string | null; image_url: string | null; current_price: number | null; current_price_baht: number | null; weight_gram: number | null; intl_shipping_type: string | null; lot_code: string | null; bought_at: Date | null }[]
  >(Prisma.sql`
    SELECT ar.id, ar.title, ar.image_url, ar.current_price, ar.current_price_baht, ar.weight_gram, ar.intl_shipping_type, l.lot_code, ar.bought_at
    FROM auction_requests ar
    LEFT JOIN lots l ON ar.lot_id = l.id
    WHERE ar.user_id = ${userId}
      AND ar.bought_at IS NOT NULL
      AND ar.intl_shipping_type = ${transportType}
      AND EXTRACT(MONTH FROM ar.bought_at AT TIME ZONE ${BANGKOK_TZ}) = ${month}
      AND EXTRACT(YEAR FROM ar.bought_at AT TIME ZONE ${BANGKOK_TZ}) = ${year}
    ORDER BY ar.bought_at ASC
  `)

  if (auctionRequests.length === 0) {
    const [user, receipt] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { username: true, user_code: true } }),
      prisma.paymentReceipt.findFirst({
        where: {
          user_id: userId,
          month,
          transport_type: transportType,
          OR: [{ year }, { year: null }],
        },
        orderBy: { created_at: 'desc' },
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
          customerId: user?.user_code ?? '',
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
      auction_request_id: { in: arIds },
      obligation_type: { code: { in: ['PRODUCT_FULL', 'INTL_SHIPPING'] } },
    },
    include: {
      obligation_type: true,
      auction_request: true,
      transactions: { select: { amount: true } },
    },
  })

  const userDomesticOb = await prisma.paymentObligation.findFirst({
    where: {
      user_id: userId,
      obligation_type: { code: 'DOMESTIC_SHIPPING' },
    },
    include: { transactions: { select: { amount: true } } },
    orderBy: { id: 'desc' },
  })

  const receipt = await prisma.paymentReceipt.findFirst({
    where: {
      user_id: userId,
      month,
      transport_type: transportType,
      OR: [{ year }, { year: null }],
    },
    orderBy: { created_at: 'desc' },
  })

  const obByAr = new Map<number, typeof obligations>()
  for (const ob of obligations) {
    if (ob.auction_request_id) {
      const list = obByAr.get(ob.auction_request_id) || []
      list.push(ob)
      obByAr.set(ob.auction_request_id, list)
    }
  }

  const arrivedAtJapanArIds = new Set(
    (
      await prisma.deliveryStage.findMany({
        where: {
          auction_request_id: { in: arIds },
          stage_type_id: 1,
          status: 'DELIVERED',
        },
        select: { auction_request_id: true },
      })
    ).map((s) => s.auction_request_id),
  )

  const shippingRate = transportType === 'air' ? SHIPPING_RATE_AIR : SHIPPING_RATE_SEA

  const products = auctionRequests.map((ar) => {
    const arObs = obByAr.get(ar.id) || []
    const productOb = arObs.find((o) => o.obligation_type.code === 'PRODUCT_FULL')
    const shippingOb = arObs.find((o) => o.obligation_type.code === 'INTL_SHIPPING')
    const productPaid = productOb ? productOb.transactions.reduce((s, t) => s + t.amount, 0) : 0
    const shippingPaid = shippingOb ? shippingOb.transactions.reduce((s, t) => s + t.amount, 0) : 0
    const shipShippingCost =
      (ar.weight_gram ?? 0) > 0
        ? bahtRoundUp((ar.weight_gram ?? 0) * shippingRate)
        : (shippingOb?.amount ?? 0)

    const intlTotal = (ar.current_price_baht ?? 0) + shipShippingCost
    const intlPaid = productPaid + shippingPaid
    const paidForProduct = intlPaid

    const dueDate = ar.bought_at ? calcDueDate(ar.bought_at, transportType as 'air' | 'sea') : null
    const isOverdue = dueDate ? dueDate < bangkokToday() && intlPaid < intlTotal : false

    const intlFullyPaid = intlPaid >= intlTotal
    const domesticShipping =
      intlFullyPaid && userDomesticOb && userDomesticOb.status === 'PENDING'
        ? userDomesticOb.amount
        : null

    return {
      id: `ar-${ar.id}`,
      auctionRequestId: ar.id,
      name: ar.title ?? 'Unknown',
      imageUrl: ar.image_url ?? null,
      yen: ar.current_price ?? 0,
      baht: ar.current_price_baht ?? 0,
      grams: ar.weight_gram ?? 0,
      shipShippingCost,
      paid: paidForProduct,
      shipRound: ar.lot_code ?? null,
      arrivedAtJapan: arrivedAtJapanArIds.has(ar.id),
      dueDate: dueDate ?? null,
      isOverdue,
      domesticShipping,
    }
  })

  const intlSum = products.reduce((s, p) => s + p.baht + p.shipShippingCost, 0)
  const totalBaht = intlSum
  const intlPaidSum = products.reduce((s, p) => s + p.paid, 0)
  const paid = intlPaidSum
  const outstanding = totalBaht - paid

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, user_code: true },
  })

  return res.json({
    success: true,
    data: {
      month: String(month),
      year: String(year),
      transportType: transportType === 'sea' ? 'ship' : 'airplane',
      user: {
        username: user?.username ?? '',
        customerId: user?.user_code ?? '',
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
      EXTRACT(MONTH FROM bought_at AT TIME ZONE ${BANGKOK_TZ})::int AS month,
      EXTRACT(YEAR FROM bought_at AT TIME ZONE ${BANGKOK_TZ})::int AS year
    FROM auction_requests
    WHERE user_id = ${userId}
      AND bought_at IS NOT NULL
    ORDER BY year DESC, month DESC
  `)

  const months = rows.map((r) => `${r.year}-${r.month}`)

  return res.json({
    success: true,
    data: { months },
  })
}

/** Same domestic-queue rules as backoffice GET /domestic-shipping-queue/:userId/items; user from JWT. */
export async function getDomesticPendingItems(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const [user, payload] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, user_code: true, username: true },
    }),
    getDomesticShippingPendingItemsForUser(userId),
  ])

  return res.json({
    success: true,
    data: {
      userId: user?.id ?? userId,
      userCode: user?.user_code ?? null,
      username: user?.username ?? null,
      ...payload,
    },
  })
}
