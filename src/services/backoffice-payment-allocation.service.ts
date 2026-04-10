/**
 * Allocate a confirmed bank-slip amount to pending PRODUCT_FULL + INTL_SHIPPING obligations
 * (same ordering as backoffice approve monthly slip), then credit wallet for overpayment.
 * Used when backoffice creates a purchase request with paid + slip in one step.
 */

import type { Prisma } from "@prisma/client";
import * as walletService from "./wallet.service";
import { PAYMENT_RECEIPT_PURPOSE_BACKOFFICE_PURCHASE } from "../../packages/shared/src";

const OBLIGATION_CODES = ["PRODUCT_FULL", "INTL_SHIPPING"] as const;
const OBLIGATION_TYPE_OVERPAYMENT = "OVERPAYMENT_TO_WALLET";

export type ObligationForAllocation = {
  id: number;
  amount: number;
  created_at: Date;
  obligation_type: { code: string };
  purchase_request: {
    end_time: Date | null;
    bought_at: Date | null;
    lot: {
      end_lot_at: Date | null;
    } | null;
  } | null;
  transactions: { amount: number }[];
};

export function sortObligationsForAllocation<T extends ObligationForAllocation>(
  obligations: T[],
): T[] {
  return [...obligations].sort((a, b) => {
    const lotA = a.purchase_request?.lot;
    const lotB = b.purchase_request?.lot;
    const hasLotA = !!lotA;
    const hasLotB = !!lotB;
    if (hasLotA !== hasLotB) return hasLotA ? -1 : 1;
    if (hasLotA && hasLotB) {
      const endA = lotA!.end_lot_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const endB = lotB!.end_lot_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (endA !== endB) return endA - endB;
    }
    const arA = a.purchase_request;
    const arB = b.purchase_request;
    const endDateA = (arA?.end_time ?? arA?.bought_at)?.getTime() ?? 0;
    const endDateB = (arB?.end_time ?? arB?.bought_at)?.getTime() ?? 0;
    if (endDateA !== endDateB) return endDateA - endDateB;
    const typeOrder: Record<string, number> = { PRODUCT_FULL: 0, INTL_SHIPPING: 1 };
    const orderA = typeOrder[a.obligation_type?.code] ?? 1;
    const orderB = typeOrder[b.obligation_type?.code] ?? 1;
    if (orderA !== orderB) return orderA - orderB;
    return a.created_at.getTime() - b.created_at.getTime();
  });
}

export function computeAllocationsFromObligations(
  obligationsSorted: ObligationForAllocation[],
  amount: number,
): { allocations: { obligationId: number; amount: number }[]; remaining: number } {
  const allocations: { obligationId: number; amount: number }[] = [];
  let remaining = amount;
  for (const ob of obligationsSorted) {
    if (remaining <= 0) break;
    const paidSoFar = ob.transactions.reduce((s, t) => s + t.amount, 0);
    const stillDue = Math.max(0, ob.amount - paidSoFar);
    if (stillDue <= 0) continue;
    const allocate = Math.min(remaining, stillDue);
    allocations.push({ obligationId: ob.id, amount: allocate });
    remaining -= allocate;
  }
  return { allocations, remaining };
}

/** Loads pending product + intl obligations for user (including user_id via purchase_request). */
export async function loadPendingProductIntlObligations(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  const typeRows = await tx.paymentObligationType.findMany({
    where: { code: { in: [...OBLIGATION_CODES] } },
    select: { id: true },
  });
  const typeIds = typeRows.map((t) => t.id);
  const raw = await tx.paymentObligation.findMany({
    where: {
      status: "PENDING",
      obligation_type_id: { in: typeIds },
      OR: [
        { user_id: userId },
        { user_id: null, purchase_request: { user_id: userId } },
      ],
    },
    include: {
      obligation_type: true,
      purchase_request: { include: { lot: true } },
      transactions: { select: { amount: true } },
    },
  });
  return sortObligationsForAllocation(raw as ObligationForAllocation[]);
}

export type ApplyBackofficePurchaseReceiptResult = {
  allocations: { obligationId: number; amount: number }[];
  overpaymentAmount: number;
  overpaymentObligationId: number | null;
};

/**
 * Receipt row must already exist with status PENDING_VERIFICATION or be created in same tx before this runs.
 * Updates receipt to CONFIRMED, writes payment_transactions, marks obligations PAID, credits wallet for overpay.
 */
export async function applyConfirmedBackofficePurchaseReceipt(
  tx: Prisma.TransactionClient,
  params: {
    receiptId: number;
    userId: number;
    amount: number;
    paidAt: Date;
  },
): Promise<ApplyBackofficePurchaseReceiptResult> {
  const { receiptId, userId, amount, paidAt } = params;

  const obligations = await loadPendingProductIntlObligations(tx, userId);
  const { allocations, remaining } = computeAllocationsFromObligations(
    obligations,
    amount,
  );

  const overpaymentType = await tx.paymentObligationType.findFirst({
    where: { code: OBLIGATION_TYPE_OVERPAYMENT },
  });
  if (!overpaymentType) {
    throw new Error("OVERPAYMENT_TO_WALLET obligation type not found");
  }

  await tx.paymentReceipt.update({
    where: { id: receiptId },
    data: {
      amount,
      status: "CONFIRMED",
      paid_at: paidAt,
      purpose: PAYMENT_RECEIPT_PURPOSE_BACKOFFICE_PURCHASE,
    },
  });

  for (const { obligationId, amount: allocAmount } of allocations) {
    await tx.paymentTransaction.create({
      data: {
        payment_obligation_id: obligationId,
        payment_receipt_id: receiptId,
        amount: allocAmount,
        paid_at: paidAt,
        source: "BANK_SLIP",
        status: "CONFIRMED",
      },
    });
    const ob = await tx.paymentObligation.findUniqueOrThrow({
      where: { id: obligationId },
      include: { transactions: true, obligation_type: true },
    });
    const totalPaid = ob.transactions.reduce((s, t) => s + t.amount, 0);
    if (totalPaid >= ob.amount) {
      await tx.paymentObligation.update({
        where: { id: obligationId },
        data: { status: "PAID" },
      });
    }
  }

  if (remaining > 0 && userId) {
    const overpayOb = await tx.paymentObligation.create({
      data: {
        user_id: userId,
        obligation_type_id: overpaymentType.id,
        amount: remaining,
        status: "PAID",
        currency: "THB",
      },
    });
    await tx.paymentTransaction.create({
      data: {
        payment_obligation_id: overpayOb.id,
        payment_receipt_id: receiptId,
        amount: remaining,
        paid_at: paidAt,
        source: "BANK_SLIP",
        status: "CONFIRMED",
      },
    });
    await walletService.creditWalletWithTx(tx, {
      userId,
      amount: remaining,
      type: walletService.WALLET_TX_TYPES.OVERPAYMENT_CREDIT,
      referenceType: "PaymentReceipt",
      referenceId: receiptId,
      idempotencyKey: `receipt-overpay-${receiptId}`,
    });
    return {
      allocations,
      overpaymentAmount: remaining,
      overpaymentObligationId: overpayOb.id,
    };
  }

  return {
    allocations,
    overpaymentAmount: 0,
    overpaymentObligationId: null,
  };
}
