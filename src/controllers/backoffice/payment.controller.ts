/**
 * @file payment.controller.ts
 * @description Backoffice slip verification — list pending receipts, approve with allocation, reject
 */

import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../packages/database/src";
import * as walletService from "../../services/wallet.service";
import {
  completeDomesticShipmentAndMarkStage3Paid,
  getDomesticPendingAuctionRequestIds,
} from "../../services/domestic-shipping.service";
import {
  PAYMENT_RECEIPT_PURPOSE_DOMESTIC,
  PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP,
} from "../../../packages/shared/src";

const BANGKOK_TZ = "Asia/Bangkok";
/** Monthly slip: product + intl only (domestic / wallet top-up use separate slip purpose). */
const OBLIGATION_TYPES_MONTHLY_SLIP = ["PRODUCT_FULL", "INTL_SHIPPING"];
const OBLIGATION_TYPE_OVERPAYMENT = "OVERPAYMENT_TO_WALLET";

export async function listPendingSlips(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.paymentReceipt.findMany({
      where: { status: "PENDING_VERIFICATION" },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      include: {
        user: {
          select: { id: true, user_code: true, name: true, email: true },
        },
        shipping_address: true,
      },
    }),
    prisma.paymentReceipt.count({ where: { status: "PENDING_VERIFICATION" } }),
  ]);

  return res.json({
    success: true,
    data: data.map((r) => ({
      receiptId: r.id,
      userId: r.user_id,
      user: r.user,
      month: r.month,
      year: r.year,
      transportType: r.transport_type,
      purpose: r.purpose ?? null,
      slipImageUrl: r.slip_image_url,
      amount: r.amount,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      shippingAddress: r.shipping_address
        ? {
            id: r.shipping_address.id,
            label: r.shipping_address.label,
            recipientName: r.shipping_address.recipient_name,
            phone: r.shipping_address.phone,
            addressLine1: r.shipping_address.address_line1,
            addressLine2: r.shipping_address.address_line2,
            subdistrict: r.shipping_address.subdistrict,
            district: r.shipping_address.district,
            province: r.shipping_address.province,
            postalCode: r.shipping_address.postal_code,
            country: r.shipping_address.country,
          }
        : null,
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
}

export async function approveSlip(req: Request, res: Response) {
  const receiptId = parseInt(req.params.receiptId);
  if (isNaN(receiptId)) {
    return res
      .status(400)
      .json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid receipt id" },
      });
  }

  const amount = parseInt(req.body.amount);
  if (isNaN(amount) || amount <= 0) {
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "INVALID_AMOUNT",
          message: "Amount is required and must be positive",
        },
      });
  }

  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: receiptId },
    include: { user: true },
  });
  if (!receipt) {
    return res
      .status(404)
      .json({
        success: false,
        error: { code: "NOT_FOUND", message: "Receipt not found" },
      });
  }
  if (receipt.status !== "PENDING_VERIFICATION") {
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "INVALID_STATUS",
          message: "Receipt is not pending verification",
        },
      });
  }

  const userId = receipt.user_id;
  const paidAt = new Date();
  const receiptMonth = receipt.month;
  const receiptYear = receipt.year ?? receipt.created_at.getFullYear();
  const receiptTransportType = receipt.transport_type;
  const receiptPurpose = receipt.purpose ?? null;

  let obligations: Awaited<
    ReturnType<
      typeof prisma.paymentObligation.findMany<{
        include: {
          obligation_type: true;
          auction_request: { include: { lot: true } };
          transactions: { select: { amount: true } };
        };
      }>
    >
  > = [];

  if (receiptPurpose === PAYMENT_RECEIPT_PURPOSE_DOMESTIC) {
    const domesticType = await prisma.paymentObligationType.findUnique({
      where: { code: "DOMESTIC_SHIPPING" },
    });
    if (!domesticType) {
      return res
        .status(500)
        .json({
          success: false,
          error: {
            code: "MISSING_TYPE",
            message: "DOMESTIC_SHIPPING type missing",
          },
        });
    }
    const domesticOb = await prisma.paymentObligation.findFirst({
      where: {
        user_id: userId,
        obligation_type_id: domesticType.id,
        status: "PENDING",
      },
      include: {
        obligation_type: true,
        auction_request: { include: { lot: true } },
        transactions: { select: { amount: true } },
      },
      orderBy: { id: "asc" },
    });
    if (!domesticOb) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_PENDING_DOMESTIC",
          message: "No pending domestic shipping obligation for this user",
        },
      });
    }
    const pendingDomesticArIds = await getDomesticPendingAuctionRequestIds(userId);
    if (pendingDomesticArIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_PENDING_DOMESTIC_ITEMS",
          message:
            "No auction items match domestic-pending-items rules (cannot approve domestic slip with nothing to ship).",
        },
      });
    }
    obligations = [domesticOb];
  } else if (receiptPurpose === PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP) {
    const walletTopupType = await prisma.paymentObligationType.findUnique({
      where: { code: "WALLET_TOPUP" },
    });
    if (!walletTopupType) {
      return res
        .status(500)
        .json({
          success: false,
          error: {
            code: "MISSING_TYPE",
            message: "WALLET_TOPUP obligation type missing",
          },
        });
    }
    const walletTopupObs = await prisma.paymentObligation.findMany({
      where: {
        user_id: userId,
        obligation_type_id: walletTopupType.id,
        status: "PENDING",
      },
      orderBy: { id: "asc" },
      include: {
        obligation_type: true,
        auction_request: { include: { lot: true } },
        transactions: { select: { amount: true } },
      },
    });
    if (walletTopupObs.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_PENDING_WALLET_TOPUP",
          message: "No pending wallet top-up obligation for this user.",
        },
      });
    }
    obligations = walletTopupObs;
  } else {
    const typeIds = await prisma.paymentObligationType.findMany({
      where: { code: { in: OBLIGATION_TYPES_MONTHLY_SLIP } },
      select: { id: true },
    });

    const transportTypes =
      receiptTransportType === "sea"
        ? ["sea", "ship"]
        : receiptTransportType === "air"
          ? ["air", "airplane"]
          : receiptTransportType
            ? [receiptTransportType]
            : [];

    const arIds =
      receiptMonth != null && transportTypes.length > 0
        ? (
            await prisma.$queryRaw<{ id: number }[]>(
              Prisma.sql`
            SELECT ar.id FROM auction_requests ar
            WHERE ar.user_id = ${userId}
              AND ar.bought_at IS NOT NULL
              AND ar.intl_shipping_type IN (${Prisma.join(transportTypes)})
              AND EXTRACT(MONTH FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptMonth}
              AND EXTRACT(YEAR FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptYear}
          `,
            )
          ).map((r) => r.id)
        : [];

    const obligationIdsFromUser =
      arIds.length === 0 && receiptMonth != null && transportTypes.length > 0
        ? (
            await prisma.$queryRaw<{ id: number }[]>(
              Prisma.sql`
            SELECT po.id FROM payment_obligations po
            JOIN auction_requests ar ON po.auction_request_id = ar.id
            WHERE (po.user_id = ${userId} OR (po.user_id IS NULL AND ar.user_id = ${userId}))
              AND po.obligation_type_id IN (${Prisma.join(typeIds.map((t) => t.id))})
              AND po.status = 'PENDING'
              AND ar.bought_at IS NOT NULL
              AND ar.intl_shipping_type IN (${Prisma.join(transportTypes)})
              AND EXTRACT(MONTH FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptMonth}
              AND EXTRACT(YEAR FROM ar.bought_at AT TIME ZONE 'UTC' AT TIME ZONE ${BANGKOK_TZ}) = ${receiptYear}
          `,
            )
          ).map((r) => r.id)
        : [];

    const obligationsRaw =
      arIds.length > 0
        ? await prisma.paymentObligation.findMany({
            where: {
              auction_request_id: { in: arIds },
              obligation_type_id: { in: typeIds.map((t) => t.id) },
              status: "PENDING",
            },
            include: {
              obligation_type: true,
              auction_request: { include: { lot: true } },
              transactions: { select: { amount: true } },
            },
          })
        : obligationIdsFromUser.length > 0
          ? await prisma.paymentObligation.findMany({
              where: {
                id: { in: obligationIdsFromUser },
                obligation_type_id: { in: typeIds.map((t) => t.id) },
                status: "PENDING",
              },
              include: {
                obligation_type: true,
                auction_request: { include: { lot: true } },
                transactions: { select: { amount: true } },
              },
            })
          : [];

    obligations = obligationsRaw.sort((a, b) => {
      const lotA = a.auction_request?.lot;
      const lotB = b.auction_request?.lot;
      const hasLotA = !!lotA;
      const hasLotB = !!lotB;
      if (hasLotA !== hasLotB) return hasLotA ? -1 : 1;
      if (hasLotA && hasLotB) {
        const endA = lotA!.end_lot_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const endB = lotB!.end_lot_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (endA !== endB) return endA - endB;
      }
      const arA = a.auction_request;
      const arB = b.auction_request;
      const endDateA = (arA?.end_time ?? arA?.bought_at)?.getTime() ?? 0;
      const endDateB = (arB?.end_time ?? arB?.bought_at)?.getTime() ?? 0;
      if (endDateA !== endDateB) return endDateA - endDateB;
      const typeOrder = { PRODUCT_FULL: 0, INTL_SHIPPING: 1 };
      const orderA =
        typeOrder[a.obligation_type?.code as keyof typeof typeOrder] ?? 1;
      const orderB =
        typeOrder[b.obligation_type?.code as keyof typeof typeOrder] ?? 1;
      if (orderA !== orderB) return orderA - orderB;
      return a.created_at.getTime() - b.created_at.getTime();
    });
  }

  const overpaymentType = await prisma.paymentObligationType.findFirst({
    where: { code: OBLIGATION_TYPE_OVERPAYMENT },
  });
  if (!overpaymentType) {
    return res
      .status(500)
      .json({
        success: false,
        error: {
          code: "MISSING_TYPE",
          message: "OVERPAYMENT_TO_WALLET obligation type not found",
        },
      });
  }

  /** Slip-upload creates WALLET_TOPUP with amount 0; staff amount fills the remainder after other pending top-ups. */
  if (receiptPurpose === PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP) {
    const zeros = obligations.filter(
      (o) => o.obligation_type.code === "WALLET_TOPUP" && o.amount === 0,
    );
    if (zeros.length > 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: "AMBIGUOUS_WALLET_TOPUP",
          message:
            "Multiple zero-amount wallet top-up obligations; resolve in backoffice before approving.",
        },
      });
    }
    if (zeros.length === 1) {
      const z = zeros[0];
      let rem = amount;
      for (const o of obligations) {
        if (o.id === z.id) continue;
        const paidSoFar = o.transactions.reduce((s, t) => s + t.amount, 0);
        const stillDue = Math.max(0, o.amount - paidSoFar);
        rem -= Math.min(rem, stillDue);
      }
      if (rem < 0) rem = 0;
      await prisma.paymentObligation.update({
        where: { id: z.id },
        data: { amount: rem },
      });
      z.amount = rem;
    }
  }

  const allocations: { obligationId: number; amount: number }[] = [];
  let remaining = amount;

  for (const ob of obligations) {
    if (remaining <= 0) break;
    const paidSoFar = ob.transactions.reduce((s, t) => s + t.amount, 0);
    const stillDue = Math.max(0, ob.amount - paidSoFar);
    if (stillDue <= 0) continue;
    const allocate = Math.min(remaining, stillDue);
    allocations.push({ obligationId: ob.id, amount: allocate });
    remaining -= allocate;
  }

  const result = await prisma.$transaction(async (db) => {
    await db.paymentReceipt.update({
      where: { id: receiptId },
      data: { amount, status: "CONFIRMED", paid_at: paidAt },
    });

    let walletTopupCredited = 0;

    for (const { obligationId, amount: allocAmount } of allocations) {
      await db.paymentTransaction.create({
        data: {
          payment_obligation_id: obligationId,
          payment_receipt_id: receiptId,
          amount: allocAmount,
          paid_at: paidAt,
          source: "BANK_SLIP",
          status: "CONFIRMED",
        },
      });
      const ob = await db.paymentObligation.findUniqueOrThrow({
        where: { id: obligationId },
        include: { transactions: true, obligation_type: true },
      });
      const totalPaid = ob.transactions.reduce((s, t) => s + t.amount, 0);

      if (ob.obligation_type.code === "WALLET_TOPUP" && userId) {
        await walletService.creditWalletWithTx(db, {
          userId,
          amount: allocAmount,
          type: walletService.WALLET_TX_TYPES.TOPUP,
          referenceType: "PaymentReceipt",
          referenceId: receiptId,
          idempotencyKey: `slip-topup-${receiptId}-ob-${obligationId}`,
        });
        walletTopupCredited += allocAmount;
      }

      if (totalPaid >= ob.amount) {
        await db.paymentObligation.update({
          where: { id: obligationId },
          data: { status: "PAID" },
        });
        if (ob.obligation_type.code === "DOMESTIC_SHIPPING") {
          const uid = ob.user_id;
          if (uid != null) {
            await completeDomesticShipmentAndMarkStage3Paid({
              userId: uid,
              receiptId,
              shippingAddressId: receipt.shipping_address_id,
              tx: db,
            });
          }
        }
      }
    }

    if (remaining > 0 && userId) {
      const overpayOb = await db.paymentObligation.create({
        data: {
          user_id: userId,
          obligation_type_id: overpaymentType.id,
          amount: remaining,
          status: "PAID",
          currency: "THB",
        },
      });
      await db.paymentTransaction.create({
        data: {
          payment_obligation_id: overpayOb.id,
          payment_receipt_id: receiptId,
          amount: remaining,
          paid_at: paidAt,
          source: "BANK_SLIP",
          status: "CONFIRMED",
        },
      });
      await walletService.creditWalletWithTx(db, {
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
        walletTopupCredited,
      };
    }
    return {
      allocations,
      overpaymentAmount: 0,
      overpaymentObligationId: null as number | null,
      walletTopupCredited,
    };
  });

  if (userId) {
    await walletService.sweepWalletToObligations({
      userId,
      sweepKey: `slip-approve-${receiptId}-${Date.now()}`,
    });
  }

  const walletCredited =
    result.overpaymentAmount > 0 || result.walletTopupCredited > 0;

  return res.json({
    success: true,
    data: {
      receiptId,
      amount,
      allocations: result.allocations,
      overpaymentAmount: result.overpaymentAmount,
      overpaymentObligationId: result.overpaymentObligationId,
      walletTopupCredited: result.walletTopupCredited,
      walletCredited,
      status: "CONFIRMED",
    },
    message: "Slip approved. Payment allocated.",
  });
}

export async function rejectSlip(req: Request, res: Response) {
  const receiptId = parseInt(req.params.receiptId);
  if (isNaN(receiptId)) {
    return res
      .status(400)
      .json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid receipt id" },
      });
  }

  const reason =
    typeof req.body.reason === "string" ? req.body.reason.trim() || null : null;

  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: receiptId },
  });
  if (!receipt) {
    return res
      .status(404)
      .json({
        success: false,
        error: { code: "NOT_FOUND", message: "Receipt not found" },
      });
  }
  if (receipt.status !== "PENDING_VERIFICATION") {
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "INVALID_STATUS",
          message: "Receipt is not pending verification",
        },
      });
  }

  await prisma.paymentReceipt.update({
    where: { id: receiptId },
    data: { status: "REJECTED", rejection_reason: reason },
  });

  return res.json({
    success: true,
    data: { receiptId, status: "REJECTED" },
    message: "Slip rejected.",
  });
}
