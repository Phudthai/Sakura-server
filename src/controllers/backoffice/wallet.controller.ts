/**
 * @file wallet.controller.ts
 * @description Backoffice wallet — create wallet top-up obligation, view user wallet
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'

export async function createTopupObligation(req: Request, res: Response) {
  const userId = parseInt(req.body.userId)
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_USER_ID', message: 'Invalid userId' } })
  }

  const amount = parseInt(req.body.amount)
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be a positive number' } })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } })
  }

  const walletTopupType = await prisma.paymentObligationType.findUnique({
    where: { code: 'WALLET_TOPUP' },
  })
  if (!walletTopupType) {
    return res.status(500).json({ success: false, error: { code: 'MISSING_TYPE', message: 'WALLET_TOPUP obligation type not found' } })
  }

  const obligation = await prisma.paymentObligation.create({
    data: {
      userId,
      auctionRequestId: null,
      obligationTypeId: walletTopupType.id,
      amount,
      currency: 'THB',
      status: 'PENDING',
    },
    include: { obligationType: true },
  })

  return res.status(201).json({
    success: true,
    data: {
      id: obligation.id,
      userId: obligation.userId,
      amount: obligation.amount,
      currency: obligation.currency,
      status: obligation.status,
      obligationType: obligation.obligationType.code,
    },
    message: 'Wallet top-up obligation created',
  })
}

export async function getUserWallet(req: Request, res: Response) {
  const userId = parseInt(req.params.id)
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid user id' } })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: {
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      },
    },
  })

  if (!user) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } })
  }

  const wallet = user.wallet
  if (!wallet) {
    const created = await prisma.userWallet.create({
      data: { userId: user.id, balance: 0, currency: 'THB' },
      include: { transactions: true },
    })
    return res.json({
      success: true,
      data: {
        userId: user.id,
        userCode: user.userCode,
        balance: created.balance,
        currency: created.currency,
        transactions: created.transactions,
      },
    })
  }

  return res.json({
    success: true,
    data: {
      userId: user.id,
      userCode: user.userCode,
      balance: wallet.balance,
      currency: wallet.currency,
      transactions: wallet.transactions,
    },
  })
}
