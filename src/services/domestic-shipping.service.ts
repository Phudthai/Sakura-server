/**
 * User-level DOMESTIC_SHIPPING obligations, domestic shipment batches, and delivery stage 3 is_paid flags.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../packages/database/src";

type Db = Prisma.TransactionClient | typeof prisma;

const STAGE_DOMESTIC_CODE = "STAGE_3_DOMESTIC_CUSTOMER";

let cachedDomesticStageTypeId: number | null = null;

export async function getDomesticCustomerStageTypeId(): Promise<number> {
  if (cachedDomesticStageTypeId != null) return cachedDomesticStageTypeId;
  const row = await prisma.deliveryStageType.findUnique({
    where: { code: STAGE_DOMESTIC_CODE },
    select: { id: true },
  });
  if (!row)
    throw new Error(`delivery_stage_types missing ${STAGE_DOMESTIC_CODE}`);
  cachedDomesticStageTypeId = row.id;
  return row.id;
}

/**
 * Same filters as GET /check-status/domestic-pending-items (getDomesticShippingPendingItemsForUser).
 */
export function buildDomesticPendingAuctionWhere(
  userId: number,
  stageTypeId: number,
): Prisma.PurchaseRequestWhereInput {
  return {
    user_id: userId,
    lot_id: { not: null },
    lot: { is_arrived: true },
    domestic_shipment_id: null,
    domestic_shipment_item: null,
    delivery_stages: {
      some: { stage_type_id: stageTypeId, is_paid: false },
    },
    AND: [
      {
        payment_obligations: {
          some: { obligation_type: { code: "PRODUCT_FULL" }, status: "PAID" },
        },
      },
      {
        payment_obligations: {
          some: {
            obligation_type: { code: "INTL_SHIPPING" },
            status: "PAID",
          },
        },
      },
    ],
  };
}

export async function getDomesticPendingAuctionRequestIds(
  userId: number,
  db: Db = prisma,
): Promise<number[]> {
  const stageTypeId = await getDomesticCustomerStageTypeId();
  const rows = await db.purchaseRequest.findMany({
    where: buildDomesticPendingAuctionWhere(userId, stageTypeId),
    select: { id: true },
  });
  return [...new Set(rows.map((r) => r.id))];
}

export type DomesticPendingItemPayload = {
  pendingDomesticItemCount: number;
  domesticPendingBaht: number | null;
  items: Array<{
    id: number;
    title: string | null;
    imageUrl: string | null;
    status: string;
    bidResult: string | null;
    weightGram: number | null;
    currentPriceBaht: number | null;
    boughtAt: string | null;
    lot: {
      id: number;
      lotCode: string | null;
      isArrived: boolean;
      arriveAt: string | null;
    } | null;
    deliveryStages: Array<{
      id: number;
      stageTypeCode: string;
      stageTypeNameTh: string | null;
      status: string;
      isPaid: boolean;
      trackingNumber: string | null;
      carrier: string | null;
      shippedAt: string | null;
      deliveredAt: string | null;
    }>;
  }>;
};

/**
 * Same rules as backoffice domestic shipping queue: lot arrived, PRODUCT_FULL + INTL_SHIPPING PAID,
 * stage 3 (domestic customer) not yet paid.
 */
export async function getDomesticShippingPendingItemsForUser(
  userId: number,
): Promise<DomesticPendingItemPayload> {
  const stageTypeId = await getDomesticCustomerStageTypeId();

  const rows = await prisma.purchaseRequest.findMany({
    where: buildDomesticPendingAuctionWhere(userId, stageTypeId),
    include: {
      lot: {
        select: {
          id: true,
          lot_code: true,
          is_arrived: true,
          arrive_at: true,
        },
      },
      delivery_stages: {
        include: { stage_type: true },
        orderBy: { stage_type: { sort_order: "asc" } },
      },
    },
    orderBy: [{ bought_at: "asc" }, { id: "asc" }],
  });

  const domesticType = await prisma.paymentObligationType.findUnique({
    where: { code: "DOMESTIC_SHIPPING" },
  });
  const domesticOb =
    domesticType != null
      ? await prisma.paymentObligation.findFirst({
          where: {
            user_id: userId,
            obligation_type_id: domesticType.id,
            status: "PENDING",
          },
        })
      : null;

  const items = rows.map((r) => {
    const stages = r.delivery_stages.map((s) => ({
      id: s.id,
      stageTypeCode: s.stage_type.code,
      stageTypeNameTh: s.stage_type.name_th,
      status: s.status,
      isPaid: s.is_paid,
      trackingNumber: s.tracking_number ?? null,
      carrier: s.carrier ?? null,
      shippedAt: s.shipped_at?.toISOString() ?? null,
      deliveredAt: s.delivered_at?.toISOString() ?? null,
    }));
    return {
      id: r.id,
      title: r.title,
      imageUrl: r.image_url,
      status: r.status,
      bidResult: r.bid_result,
      weightGram: r.weight_gram,
      currentPriceBaht: r.current_price_baht,
      boughtAt: r.bought_at?.toISOString() ?? null,
      lot: r.lot
        ? {
            id: r.lot.id,
            lotCode: r.lot.lot_code,
            isArrived: r.lot.is_arrived,
            arriveAt: r.lot.arrive_at?.toISOString() ?? null,
          }
        : null,
      deliveryStages: stages,
    };
  });

  return {
    pendingDomesticItemCount: items.length,
    domesticPendingBaht: domesticOb?.amount ?? null,
    items,
  };
}

/**
 * After DOMESTIC_SHIPPING is paid: create domestic_shipments + items for the same auction rows as
 * domestic-pending-items, set purchase_requests.domestic_shipment_id, then mark stage 3 paid only for those rows.
 * `receiptId` null = paid via wallet (no slip row).
 */
export async function completeDomesticShipmentAndMarkStage3Paid(params: {
  userId: number;
  receiptId: number | null;
  shippingAddressId: number | null;
  tx: Db;
}): Promise<void> {
  const { userId, receiptId, shippingAddressId, tx } = params;

  if (receiptId != null) {
    const existing = await tx.domesticShipment.findUnique({
      where: { payment_receipt_id: receiptId },
    });
    if (existing) return;
  }

  const stageTypeId = await getDomesticCustomerStageTypeId();
  let auctionIds = await getDomesticPendingAuctionRequestIds(userId, tx);
  if (auctionIds.length === 0) {
    return;
  }

  const alreadyLinked = await tx.domesticShipmentItem.findMany({
    where: { purchase_request_id: { in: auctionIds } },
    select: { purchase_request_id: true },
  });
  const linkedSet = new Set(alreadyLinked.map((r) => r.purchase_request_id));
  auctionIds = auctionIds.filter((id) => !linkedSet.has(id));
  if (auctionIds.length === 0) {
    return;
  }

  let snapshot: {
    snapshot_recipient_name: string | null;
    snapshot_phone: string | null;
    snapshot_address_line1: string | null;
    snapshot_address_line2: string | null;
    snapshot_subdistrict: string | null;
    snapshot_district: string | null;
    snapshot_province: string | null;
    snapshot_postal_code: string | null;
    snapshot_country: string | null;
  } = {
    snapshot_recipient_name: null,
    snapshot_phone: null,
    snapshot_address_line1: null,
    snapshot_address_line2: null,
    snapshot_subdistrict: null,
    snapshot_district: null,
    snapshot_province: null,
    snapshot_postal_code: null,
    snapshot_country: null,
  };

  if (shippingAddressId != null) {
    const addr = await tx.userShippingAddress.findUnique({
      where: { id: shippingAddressId },
    });
    if (addr) {
      snapshot = {
        snapshot_recipient_name: addr.recipient_name,
        snapshot_phone: addr.phone,
        snapshot_address_line1: addr.address_line1,
        snapshot_address_line2: addr.address_line2,
        snapshot_subdistrict: addr.subdistrict,
        snapshot_district: addr.district,
        snapshot_province: addr.province,
        snapshot_postal_code: addr.postal_code,
        snapshot_country: addr.country,
      };
    }
  }

  const shipment = await tx.domesticShipment.create({
    data: {
      user_id: userId,
      payment_receipt_id: receiptId,
      shipping_address_id: shippingAddressId,
      ...snapshot,
    },
  });

  await tx.domesticShipmentItem.createMany({
    data: auctionIds.map((purchase_request_id) => ({
      shipment_id: shipment.id,
      purchase_request_id,
    })),
  });

  await tx.purchaseRequest.updateMany({
    where: { id: { in: auctionIds } },
    data: { domestic_shipment_id: shipment.id },
  });

  await tx.deliveryStage.updateMany({
    where: {
      stage_type_id: stageTypeId,
      is_paid: false,
      purchase_request_id: { in: auctionIds },
    },
    data: { is_paid: true },
  });
}
