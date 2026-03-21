/**
 * @file wallet.service.ts
 * @description User wallet business logic — credit, debit, pay-obligation
 * @module @sakura/api/services
 */

import { prisma } from '../../packages/database/src'
import { markUserDomesticStage3Paid } from './domestic-shipping.service'

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
  let wallet = await prisma.userWallet.findUnique({ where: { user_id: userId } })
  if (!wallet) {
    wallet = await prisma.userWallet.create({
      data: { user_id: userId, balance: 0, currency: 'THB' },
    })
  }
  return wallet
}

async function getOrCreateWalletWithTx(tx: TxClient, userId: number) {
  let wallet = await tx.userWallet.findUnique({ where: { user_id: userId } })
  if (!wallet) {
    wallet = await tx.userWallet.create({
      data: { user_id: userId, balance: 0, currency: 'THB' },
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
      wallet_id: wallet.id,
      amount,
      balance_after: newBalance,
      type,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      idempotency_key: idempotencyKey ?? null,
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
      where: { idempotency_key: idempotencyKey },
      include: { wallet: true },
    })
    if (existing && existing.wallet.user_id === userId) {
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
          wallet_id: wallet.id,
          amount,
          balance_after: newBalance,
          type,
          reference_type: referenceType ?? null,
          reference_id: referenceId ?? null,
          idempotency_key: idempotencyKey ?? null,
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
      where: { idempotency_key: idempotencyKey },
      include: { wallet: true },
    })
    if (existing && existing.wallet.user_id === userId) {
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
          wallet_id: wallet.id,
          amount: -amount,
          balance_after: newBalance,
          type,
          reference_type: referenceType ?? null,
          reference_id: referenceId ?? null,
          idempotency_key: idempotencyKey ?? null,
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
 * Sweep wallet balance to cover all PENDING obligations (PRODUCT_FULL + INTL_SHIPPING only;
 * DOMESTIC_SHIPPING is excluded so customers can batch multiple lots before paying domestic fee).
 * Priority order matches backoffice approveSlip:
 *   1. Items with lot → oldest lot first (by lot.end_lot_at ASC)
 *   2. Items without lot → oldest auction end date first
 *   3. Within same priority → PRODUCT_FULL before INTL_SHIPPING
 *
 * Partial payment allowed — deducts as much as wallet balance allows.
 * Each obligation deduction is independently idempotent via sweepKey.
 */
export async function sweepWalletToObligations(params: {
  userId: number
  sweepKey: string
}): Promise<{ totalPaid: number; obligationsPaid: number[] }> {
  const { userId, sweepKey } = params

  const obligations = await prisma.paymentObligation.findMany({
    where: {
      user_id: userId,
      status: 'PENDING',
      obligation_type: { code: { in: ['PRODUCT_FULL', 'INTL_SHIPPING'] } },
    },
    include: {
      obligation_type: true,
      auction_request: { include: { lot: true } },
      transactions: { select: { amount: true } },
    },
  })

  const TYPE_ORDER: Record<string, number> = { PRODUCT_FULL: 0, INTL_SHIPPING: 1 }
  obligations.sort((a, b) => {
    const lotA = a.auction_request?.lot
    const lotB = b.auction_request?.lot
    const hasLotA = !!lotA
    const hasLotB = !!lotB
    if (hasLotA !== hasLotB) return hasLotA ? -1 : 1
    if (hasLotA && hasLotB) {
      const endA = lotA!.end_lot_at?.getTime() ?? Number.MAX_SAFE_INTEGER
      const endB = lotB!.end_lot_at?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (endA !== endB) return endA - endB
    }
    const arA = a.auction_request
    const arB = b.auction_request
    const endDateA = (arA?.end_time ?? arA?.bought_at)?.getTime() ?? 0
    const endDateB = (arB?.end_time ?? arB?.bought_at)?.getTime() ?? 0
    if (endDateA !== endDateB) return endDateA - endDateB
    const typeOrder = (TYPE_ORDER[a.obligation_type.code] ?? 2) - (TYPE_ORDER[b.obligation_type.code] ?? 2)
    if (typeOrder !== 0) return typeOrder
    return a.created_at.getTime() - b.created_at.getTime()
  })

  let totalPaid = 0
  const obligationsPaid: number[] = []

  for (const ob of obligations) {
    const wallet = await prisma.userWallet.findUnique({ where: { user_id: userId } })
    if (!wallet || wallet.balance <= 0) break

    const paidSoFar = ob.transactions.reduce((s, t) => s + t.amount, 0)
    const stillDue = Math.max(0, ob.amount - paidSoFar)
    if (stillDue <= 0) continue

    const idempotencyKey = `${sweepKey}-ob-${ob.id}`
    const existingWt = await prisma.walletTransaction.findUnique({ where: { idempotency_key: idempotencyKey } })
    if (existingWt) continue

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const freshWallet = await prisma.userWallet.findUnique({ where: { user_id: userId } })
      if (!freshWallet || freshWallet.balance <= 0) break

      const actualDeduct = Math.min(freshWallet.balance, stillDue)
      const newBalance = freshWallet.balance - actualDeduct
      const newVersion = freshWallet.version + 1

      const result = await prisma.$transaction(async (tx) => {
        const w = await tx.userWallet.updateMany({
          where: { id: freshWallet.id, version: freshWallet.version },
          data: { balance: newBalance, version: newVersion },
        })
        if (w.count === 0) return null

        const wt = await tx.walletTransaction.create({
          data: {
            wallet_id: freshWallet.id,
            amount: -actualDeduct,
            balance_after: newBalance,
            type: WALLET_TX_TYPES.PAYMENT_DEBIT,
            reference_type: 'PaymentObligation',
            reference_id: ob.id,
            idempotency_key: idempotencyKey,
          },
        })

        await tx.paymentTransaction.create({
          data: {
            payment_obligation_id: ob.id,
            amount: actualDeduct,
            paid_at: new Date(),
            source: 'WALLET',
            wallet_transaction_id: wt.id,
            status: 'CONFIRMED',
          },
        })

        const totalPaidOb = paidSoFar + actualDeduct
        if (totalPaidOb >= ob.amount) {
          await tx.paymentObligation.update({
            where: { id: ob.id },
            data: { status: 'PAID' },
          })
          obligationsPaid.push(ob.id)
        }

        return actualDeduct
      })

      if (result !== null) {
        totalPaid += result
        break
      }
    }
  }

  return { totalPaid, obligationsPaid }
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
    include: { obligation_type: true, auction_request: true },
  })
  if (!obligation) throw new Error('Obligation not found')

  const effectiveUserId = obligation.user_id ?? obligation.auction_request?.user_id
  if (effectiveUserId !== userId) throw new Error('Obligation does not belong to user')

  if (obligation.status === 'PAID') throw new Error('Obligation already paid')

  const walletTypes = ['WALLET_TOPUP', 'OVERPAYMENT_TO_WALLET']
  if (walletTypes.includes(obligation.obligation_type.code)) {
    throw new Error('Cannot pay wallet top-up or overpayment obligation from wallet')
  }

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.userWallet.findUnique({ where: { user_id: userId } })
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
        wallet_id: wallet.id,
        amount: -obligation.amount,
        balance_after: newBalance,
        type: WALLET_TX_TYPES.PAYMENT_DEBIT,
        reference_type: 'PaymentObligation',
        reference_id: obligationId,
        idempotency_key: idempotencyKey ?? null,
      },
    })

    const pt = await tx.paymentTransaction.create({
      data: {
        payment_obligation_id: obligationId,
        amount: obligation.amount,
        paid_at: new Date(),
        source: 'WALLET',
        wallet_transaction_id: wt.id,
      },
    })

    await tx.paymentObligation.update({
      where: { id: obligationId },
      data: { status: 'PAID' },
    })

    if (obligation.obligation_type.code === 'DOMESTIC_SHIPPING') {
      await markUserDomesticStage3Paid(userId, tx)
    }

    const updatedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } })
    return { walletTransaction: wt, paymentTransaction: pt, wallet: updatedWallet }
  })

  return result
}
