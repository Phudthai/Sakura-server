/**
 * @file payment.controller.ts
 * @description Backoffice slip verification — list pending receipts, approve with allocation, reject
 */

import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../packages/database/src'
import * as walletService from '../../services/wallet.service'

const BANGKOK_TZ = 'Asia/Bangkok'
const OBLIGATION_TYPES_ALLOCATABLE = ['PRODUCT_FULL', 'INTL_SHIPPING']
const OBLIGATION_TYPE_OVERPAYMENT = 'OVERPAYMENT_TO_WALLET'

export async function listPendingSlips(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.paymentReceipt.findMany({
      where: { status: 'PENDING_VERIFICATION' },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, userCode: true, name: true, email: true } },
      },
    }),
    prisma.paymentReceipt.count({ where: { status: 'PENDING_VERIFICATION' } }),
  ])

  return res.json({
    success: true,
    data: data.map((r) => ({
      receiptId: r.id,
      userId: r.userId,
      user: r.user,
      month: r.month,
      year: r.year,
      transportType: r.transportType,
      slipImageUrl: r.slipImageUrl,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  })
}

export async function approveSlip(req: Request, res: Response) {
  const receiptId = parseInt(req.params.receiptId)
  if (isNaN(receiptId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid receipt id' } })
  }

  const amount = parseInt(req.body.amount)
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount is required and must be positive' } })
  }

  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: receiptId },
    include: { user: true },
  })
  if (!receipt) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Receipt not found' } })
  }
  if (receipt.status !== 'PENDING_VERIFICATION') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Receipt is not pending verification' } })
  }

  const userId = receipt.userId
  const paidAt = new Date()
  const receiptMonth = receipt.month
  const receiptYear = receipt.year ?? receipt.createdAt.getFullYear()
  const receiptTransportType = receipt.transportType

  const typeIds = await prisma.paymentObligationType.findMany({
    where: { code: { in: OBLIGATION_TYPES_ALLOCATABLE } },
    select: { id: true },
  })

  const transportTypes =
    receiptTransportType === 'sea'
      ? ['sea', 'ship']
      : receiptTransportType === 'air'
        ? ['air', 'airplane']
        : receiptTransportType
          ? [receiptTransportType]
          : []

  const arIds =
    receiptMonth != null && transportTypes.length > 0
      ? (
          await prisma.$queryRaw<{ id: number }[]>(
            Prisma.sql`
            SELECT ar.id FROM auction_requests ar
            WHERE ar."userId" = ${userId}
              AND ar.bought_at IS NOT NULL
              AND ar.intl_shipping_type IN (${Prisma.join(transportTypes)})
              AND EXTRACT(MONTH FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptMonth}
              AND EXTRACT(YEAR FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptYear}
          `,
          )
        ).map((r) => r.id)
      : []

  const obligationIdsFromUser =
    arIds.length === 0 &&
    receiptMonth != null &&
    transportTypes.length > 0
      ? (
          await prisma.$queryRaw<{ id: number }[]>(
            Prisma.sql`
            SELECT po.id FROM payment_obligations po
            JOIN auction_requests ar ON po.auction_request_id = ar.id
            WHERE (po.user_id = ${userId} OR (po.user_id IS NULL AND ar."userId" = ${userId}))
              AND po.obligation_type_id IN (${Prisma.join(typeIds.map((t) => t.id))})
              AND po.status = 'PENDING'
              AND ar.bought_at IS NOT NULL
              AND ar.intl_shipping_type IN (${Prisma.join(transportTypes)})
              AND EXTRACT(MONTH FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptMonth}
              AND EXTRACT(YEAR FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptYear}
          `,
          )
        ).map((r) => r.id)
      : []

  const obligationsRaw =
    arIds.length > 0
      ? await prisma.paymentObligation.findMany({
          where: {
            auctionRequestId: { in: arIds },
            obligationTypeId: { in: typeIds.map((t) => t.id) },
            status: 'PENDING',
          },
          include: {
            obligationType: true,
            auctionRequest: { include: { lot: true } },
            transactions: { select: { amount: true } },
          },
        })
      : obligationIdsFromUser.length > 0
        ? await prisma.paymentObligation.findMany({
            where: {
              id: { in: obligationIdsFromUser },
              obligationTypeId: { in: typeIds.map((t) => t.id) },
              status: 'PENDING',
            },
            include: {
              obligationType: true,
              auctionRequest: { include: { lot: true } },
              transactions: { select: { amount: true } },
            },
          })
        : []

  const obligations = obligationsRaw.sort((a, b) => {
    const lotA = a.auctionRequest?.lot
    const lotB = b.auctionRequest?.lot
    const hasLotA = !!lotA
    const hasLotB = !!lotB
    if (hasLotA !== hasLotB) return hasLotA ? -1 : 1
    if (hasLotA && hasLotB) {
      const endA = lotA!.endLotAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const endB = lotB!.endLotAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (endA !== endB) return endA - endB
    }
    const arA = a.auctionRequest
    const arB = b.auctionRequest
    const endDateA = (arA?.endTime ?? arA?.boughtAt)?.getTime() ?? 0
    const endDateB = (arB?.endTime ?? arB?.boughtAt)?.getTime() ?? 0
    if (endDateA !== endDateB) return endDateA - endDateB
    const typeOrder = { PRODUCT_FULL: 0, INTL_SHIPPING: 1 }
    const orderA = typeOrder[a.obligationType?.code as keyof typeof typeOrder] ?? 2
    const orderB = typeOrder[b.obligationType?.code as keyof typeof typeOrder] ?? 2
    if (orderA !== orderB) return orderA - orderB
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  const overpaymentType = await prisma.paymentObligationType.findFirst({
    where: { code: OBLIGATION_TYPE_OVERPAYMENT },
  })
  if (!overpaymentType) {
    return res.status(500).json({ success: false, error: { code: 'MISSING_TYPE', message: 'OVERPAYMENT_TO_WALLET obligation type not found' } })
  }

  const allocations: { obligationId: number; amount: number }[] = []
  let remaining = amount

  for (const ob of obligations) {
    if (remaining <= 0) break
    const paidSoFar = ob.transactions.reduce((s, t) => s + t.amount, 0)
    const stillDue = Math.max(0, ob.amount - paidSoFar)
    if (stillDue <= 0) continue
    const allocate = Math.min(remaining, stillDue)
    allocations.push({ obligationId: ob.id, amount: allocate })
    remaining -= allocate
  }

  const result = await prisma.$transaction(async (db) => {
    await db.paymentReceipt.update({
      where: { id: receiptId },
      data: { amount, status: 'CONFIRMED', paidAt },
    })

    for (const { obligationId, amount: allocAmount } of allocations) {
      await db.paymentTransaction.create({
        data: {
          paymentObligationId: obligationId,
          paymentReceiptId: receiptId,
          amount: allocAmount,
          paidAt,
          source: 'BANK_SLIP',
          status: 'CONFIRMED',
        },
      })
      const ob = await db.paymentObligation.findUniqueOrThrow({
        where: { id: obligationId },
        include: { transactions: true },
      })
      const totalPaid = ob.transactions.reduce((s, t) => s + t.amount, 0)
      if (totalPaid >= ob.amount) {
        await db.paymentObligation.update({
          where: { id: obligationId },
          data: { status: 'PAID' },
        })
      }
    }

    if (remaining > 0 && userId) {
      const overpayOb = await db.paymentObligation.create({
        data: {
          userId,
          obligationTypeId: overpaymentType.id,
          amount: remaining,
          status: 'PAID',
          currency: 'THB',
        },
      })
      await db.paymentTransaction.create({
        data: {
          paymentObligationId: overpayOb.id,
          paymentReceiptId: receiptId,
          amount: remaining,
          paidAt,
          source: 'BANK_SLIP',
          status: 'CONFIRMED',
        },
      })
      await walletService.creditWalletWithTx(db, {
        userId,
        amount: remaining,
        type: walletService.WALLET_TX_TYPES.OVERPAYMENT_CREDIT,
        referenceType: 'PaymentReceipt',
        referenceId: receiptId,
        idempotencyKey: `receipt-overpay-${receiptId}`,
      })
      return { allocations, overpaymentAmount: remaining, overpaymentObligationId: overpayOb.id }
    }
    return { allocations, overpaymentAmount: 0, overpaymentObligationId: null as number | null }
  })

  const walletCredited = result.overpaymentAmount > 0

  return res.json({
    success: true,
    data: {
      receiptId,
      amount,
      allocations: result.allocations,
      overpaymentAmount: result.overpaymentAmount,
      overpaymentObligationId: result.overpaymentObligationId,
      walletCredited,
      status: 'CONFIRMED',
    },
    message: 'Slip approved. Payment allocated.',
  })
}

export async function rejectSlip(req: Request, res: Response) {
  const receiptId = parseInt(req.params.receiptId)
  if (isNaN(receiptId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid receipt id' } })
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() || null : null

  const receipt = await prisma.paymentReceipt.findUnique({ where: { id: receiptId } })
  if (!receipt) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Receipt not found' } })
  }
  if (receipt.status !== 'PENDING_VERIFICATION') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Receipt is not pending verification' } })
  }

  await prisma.paymentReceipt.update({
    where: { id: receiptId },
    data: { status: 'REJECTED', rejectionReason: reason },
  })

  return res.json({
    success: true,
    data: { receiptId, status: 'REJECTED' },
    message: 'Slip rejected.',
  })
}
