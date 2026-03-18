/**
 * @file wallet.service.ts
 * @description User wallet business logic — credit, debit, pay-obligation
 * @module @sakura/api/services
 */

import { prisma } from '../../packages/database/src'

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export const WALLET_TX_TYPES = {
  TOPUP: 'TOPUP',
  OVERPAYMENT_CREDIT: 'OVERPAYMENT_CREDIT',
  PAYMENT_DEBIT: 'PAYMENT_DEBIT',
  REFUND: 'REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
} as const

export type WalletTxType = (typeof WALLET_TX_TYPES)[keyof typeof WALLET_TX_TYPES]

const MAX_RETRIES = 5

async function getOrCreateWallet(userId: number) {
  let wallet = await prisma.userWallet.findUnique({ where: { userId } })
  if (!wallet) {
    wallet = await prisma.userWallet.create({
      data: { userId, balance: 0, currency: 'THB' },
    })
  }
  return wallet
}

async function getOrCreateWalletWithTx(tx: TxClient, userId: number) {
  let wallet = await tx.userWallet.findUnique({ where: { userId } })
  if (!wallet) {
    wallet = await tx.userWallet.create({
      data: { userId, balance: 0, currency: 'THB' },
    })
  }
  return wallet
}

/**
 * Credit wallet within an existing transaction. Use when you need atomicity with other DB ops.
 * Skips idempotency check — caller ensures single use within the transaction.
 */
export async function creditWalletWithTx(
  tx: TxClient,
  params: {
    userId: number
    amount: number
    type: WalletTxType
    referenceType?: string
    referenceId?: number
    idempotencyKey?: string
  },
) {
  const { userId, amount, type, referenceType, referenceId, idempotencyKey } = params
  if (amount <= 0) throw new Error('Amount must be positive')

  const wallet = await getOrCreateWalletWithTx(tx, userId)
  const newBalance = wallet.balance + amount
  const newVersion = wallet.version + 1

  const w = await tx.userWallet.updateMany({
    where: { id: wallet.id, version: wallet.version },
    data: { balance: newBalance, version: newVersion },
  })
  if (w.count === 0) throw new Error('Wallet update failed: optimistic lock conflict')

  const wt = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      balanceAfter: newBalance,
      type,
      referenceType: referenceType ?? null,
      referenceId: referenceId ?? null,
      idempotencyKey: idempotencyKey ?? null,
    },
  })
  const updatedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } })
  return { walletTransaction: wt, wallet: updatedWallet }
}

/**
 * Credit wallet (add balance). Uses optimistic locking and idempotency.
 */
export async function creditWallet(params: {
  userId: number
  amount: number
  type: WalletTxType
  referenceType?: string
  referenceId?: number
  idempotencyKey?: string
}) {
  const { userId, amount, type, referenceType, referenceId, idempotencyKey } = params
  if (amount <= 0) throw new Error('Amount must be positive')

  if (idempotencyKey) {
    const existing = await prisma.walletTransaction.findUnique({
      where: { idempotencyKey },
      include: { wallet: true },
    })
    if (existing && existing.wallet.userId === userId) {
      return { walletTransaction: existing, wallet: existing.wallet }
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const wallet = await getOrCreateWallet(userId)
    const newBalance = wallet.balance + amount
    const newVersion = wallet.version + 1

    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.userWallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: { balance: newBalance, version: newVersion },
      })
      if (w.count === 0) return null

      const wt = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount,
          balanceAfter: newBalance,
          type,
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          idempotencyKey: idempotencyKey ?? null,
        },
      })
      const updatedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } })
      return { walletTransaction: wt, wallet: updatedWallet }
    })

    if (updated) return updated
  }
  throw new Error('Wallet update failed: optimistic lock conflict')
}

/**
 * Debit wallet (subtract balance). Uses optimistic locking and idempotency.
 */
export async function debitWallet(params: {
  userId: number
  amount: number
  type: WalletTxType
  referenceType?: string
  referenceId?: number
  idempotencyKey?: string
}) {
  const { userId, amount, type, referenceType, referenceId, idempotencyKey } = params
  if (amount <= 0) throw new Error('Amount must be positive')

  if (idempotencyKey) {
    const existing = await prisma.walletTransaction.findUnique({
      where: { idempotencyKey },
      include: { wallet: true },
    })
    if (existing && existing.wallet.userId === userId) {
      return { walletTransaction: existing, wallet: existing.wallet }
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const wallet = await getOrCreateWallet(userId)
    if (wallet.balance < amount) throw new Error('Insufficient balance')

    const newBalance = wallet.balance - amount
    const newVersion = wallet.version + 1

    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.userWallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: { balance: newBalance, version: newVersion },
      })
      if (w.count === 0) return null

      const wt = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: -amount,
          balanceAfter: newBalance,
          type,
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          idempotencyKey: idempotencyKey ?? null,
        },
      })
      const updatedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } })
      return { walletTransaction: wt, wallet: updatedWallet }
    })

    if (updated) return updated
  }
  throw new Error('Wallet update failed: optimistic lock conflict')
}

/**
 * Pay an obligation from wallet. Debits wallet, creates PaymentTransaction (source=WALLET), marks obligation PAID.
 */
export async function payObligationFromWallet(params: {
  userId: number
  obligationId: number
  idempotencyKey?: string
}) {
  const { userId, obligationId, idempotencyKey } = params

  const obligation = await prisma.paymentObligation.findUnique({
    where: { id: obligationId },
    include: { obligationType: true, auctionRequest: true },
  })
  if (!obligation) throw new Error('Obligation not found')

  const effectiveUserId = obligation.userId ?? obligation.auctionRequest?.userId
  if (effectiveUserId !== userId) throw new Error('Obligation does not belong to user')

  if (obligation.status === 'PAID') throw new Error('Obligation already paid')

  const walletTypes = ['WALLET_TOPUP', 'OVERPAYMENT_TO_WALLET']
  if (walletTypes.includes(obligation.obligationType.code)) {
    throw new Error('Cannot pay wallet top-up or overpayment obligation from wallet')
  }

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.userWallet.findUnique({ where: { userId } })
    if (!wallet) throw new Error('Wallet not found')
    if (wallet.balance < obligation.amount) throw new Error('Insufficient balance')

    const newBalance = wallet.balance - obligation.amount
    const newVersion = wallet.version + 1

    const w = await tx.userWallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: { balance: newBalance, version: newVersion },
    })
    if (w.count === 0) throw new Error('Wallet update failed: optimistic lock conflict')

    const wt = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -obligation.amount,
        balanceAfter: newBalance,
        type: WALLET_TX_TYPES.PAYMENT_DEBIT,
        referenceType: 'PaymentObligation',
        referenceId: obligationId,
        idempotencyKey: idempotencyKey ?? null,
      },
    })

    const pt = await tx.paymentTransaction.create({
      data: {
        paymentObligationId: obligationId,
        amount: obligation.amount,
        paidAt: new Date(),
        source: 'WALLET',
        walletTransactionId: wt.id,
      },
    })

    await tx.paymentObligation.update({
      where: { id: obligationId },
      data: { status: 'PAID' },
    })

    const updatedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } })
    return { walletTransaction: wt, paymentTransaction: pt, wallet: updatedWallet }
  })

  return result
}
