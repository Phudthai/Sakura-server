/**
 * @file wallet.controller.ts
 * @description Enduser wallet — balance, pay obligation from wallet
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import * as walletService from '../../services/wallet.service'

const DEFAULT_LIMIT = 20

export async function getWallet(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 100)

  const wallet = await prisma.userWallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: limit,
      },
    },
  })

  if (!wallet) {
    const created = await prisma.userWallet.create({
      data: { userId, balance: 0, currency: 'THB' },
      include: { transactions: true },
    })
    return res.json({
      success: true,
      data: {
        balance: created.balance,
        currency: created.currency,
        transactions: created.transactions,
      },
    })
  }

  return res.json({
    success: true,
    data: {
      balance: wallet.balance,
      currency: wallet.currency,
      transactions: wallet.transactions,
    },
  })
}

export async function payObligation(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const obligationId = parseInt(req.params.obligationId)
  if (isNaN(obligationId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid obligation id' } })
  }

  const idempotencyKey = typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() || undefined : undefined

  try {
    const result = await walletService.payObligationFromWallet({ userId, obligationId, idempotencyKey })
    return res.json({
      success: true,
      data: {
        obligationId,
        paymentTransactionId: result.paymentTransaction.id,
        walletTransactionId: result.walletTransaction.id,
        newBalance: result.wallet.balance,
      },
      message: 'Payment successful',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Payment failed'
    if (msg.includes('not found')) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: msg } })
    if (msg.includes('does not belong')) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: msg } })
    if (msg.includes('already paid')) return res.status(400).json({ success: false, error: { code: 'ALREADY_PAID', message: msg } })
    if (msg.includes('Insufficient balance')) return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_BALANCE', message: msg } })
    if (msg.includes('Cannot pay')) return res.status(400).json({ success: false, error: { code: 'INVALID_OBLIGATION_TYPE', message: msg } })
    return res.status(500).json({ success: false, error: { code: 'PAYMENT_FAILED', message: msg } })
  }
}
