/**
 * @file auction.controller.ts
 * @description Backoffice auction request operations
 */

import { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { prisma, generateUserCode } from "../../../packages/database/src";
import {
  createAuctionBackofficeSchema,
  updateAuctionStatusSchema,
  updateAuctionNoteSchema,
  updateAuctionWeightGramSchema,
  updateDomesticShippingSchema,
  assignLotToAuctionSchema,
  bahtRoundUp,
} from "../../../packages/shared/src";
import { jpyToBaht } from "../../services/exchange-rate.service";
import { scrapeYahooAuction } from "../../services/auction-scraper.service";
import { ensureNextLotExists } from "../../services/lot.service";
import { sweepWalletToObligations } from "../../services/wallet.service";
import {
  getDomesticCustomerStageTypeId,
  getDomesticShippingPendingItemsForUser,
} from "../../services/domestic-shipping.service";
import { computeIntlPaymentSnapshot } from "../../services/auction-intl-payment.service";

type AuctionListRow = Awaited<
  ReturnType<
    typeof prisma.auctionRequest.findMany<{
      include: {
        price_logs: true;
        user: true;
        lot: true;
        delivery_stages: { include: { stage_type: true } };
      };
    }>
  >
>[number];

function mapAuctionListRow(r: AuctionListRow) {
  const lastBid = r.price_logs[0];
  const { user, lot } = r;
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
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  return {
    id: r.id,
    userId: r.user_id,
    url: r.url,
    title: r.title,
    status: r.status,
    note: r.note,
    imageUrl: r.image_url,
    currentPrice: r.current_price,
    currentPriceBaht: r.current_price_baht,
    weightGram: r.weight_gram,
    intlShippingType: r.intl_shipping_type,
    lotId: r.lot_id,
    userCode: user?.user_code ?? null,
    username: user?.username ?? null,
    externalId: user?.external_id ?? null,
    register_url: user?.user_code
      ? `${process.env.FRONTEND_URL ?? ""}/register?user_code=${user.user_code}`
      : null,
    lastBid: lastBid
      ? { price: lastBid.price, status: lastBid.status }
      : null,
    lot: lot
      ? {
          id: lot.id,
          lot_code: lot.lot_code,
          intl_shipping_type: lot.intl_shipping_type,
          start_lot_at: lot.start_lot_at?.toISOString() ?? null,
          end_lot_at: lot.end_lot_at?.toISOString() ?? null,
          arrive_at: lot.arrive_at?.toISOString() ?? null,
        }
      : null,
    deliveryStages: stages,
    isDeliveried,
    endTime: r.end_time?.toISOString() ?? null,
  };
}

export async function listAuctionsBackoffice(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const user_code = req.query.user_code as string | undefined;

  const delivery_stage = req.query.delivery_stage as string | undefined;
  const shipping_type = req.query.shipping_type as string | undefined;

  const lotIdRaw = req.query.lot_id as string | undefined;
  const lotIdParsed = lotIdRaw !== undefined ? parseInt(lotIdRaw, 10) : NaN;
  const lotIdFilter =
    !Number.isNaN(lotIdParsed) && lotIdParsed > 0
      ? { lot_id: lotIdParsed }
      : {};

  const intlOutstanding = req.query.intl_outstanding === "true";
  const overduePayment = req.query.overdue_payment === "true";
  const includeUnpaidCustomerCopy =
    req.query.include_unpaid_customer_copy === "true";

  if (includeUnpaidCustomerCopy && !intlOutstanding && !overduePayment) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_QUERY",
        message:
          "include_unpaid_customer_copy requires intl_outstanding=true and/or overdue_payment=true",
      },
    });
  }

  // delivery_stage: 0=type1 PENDING (ยังไม่ถึงบ้านญี่ปุ่น), 1+=type_id DELIVERED
  let deliveryStageFilter:
    | { delivery_stages: { some: { stage_type_id: number; status: string } } }
    | object = {};
  if (delivery_stage === "0") {
    deliveryStageFilter = {
      delivery_stages: { some: { stage_type_id: 1, status: "PENDING" } },
    };
  } else if (delivery_stage) {
    const typeId = parseInt(delivery_stage, 10);
    if (!Number.isNaN(typeId) && typeId >= 1) {
      deliveryStageFilter = {
        delivery_stages: {
          some: { stage_type_id: typeId, status: "DELIVERED" },
        },
      };
    }
  }

  const where = {
    ...(status ? { status } : {}),
    ...(user_code
      ? { user: { OR: [{ user_code: user_code }, { username: user_code }] } }
      : {}),
    ...(shipping_type && (shipping_type === "air" || shipping_type === "sea")
      ? { intl_shipping_type: shipping_type }
      : {}),
    ...deliveryStageFilter,
    ...lotIdFilter,
  };

  const listInclude = {
    price_logs: { orderBy: { recorded_at: "desc" as const }, take: 1 },
    user: {
      select: { user_code: true, username: true, external_id: true },
    },
    lot: true,
    delivery_stages: {
      include: { stage_type: true },
      orderBy: { stage_type: { sort_order: "asc" as const } },
    },
  };

  const needsIntlFilter = intlOutstanding || overduePayment;

  if (!needsIntlFilter) {
    const [data, total] = await Promise.all([
      prisma.auctionRequest.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: listInclude,
      }),
      prisma.auctionRequest.count({ where }),
    ]);

    return res.json({
      success: true,
      data: data.map(mapAuctionListRow),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  }

  const candidates = await prisma.auctionRequest.findMany({
    where,
    select: {
      id: true,
      user_id: true,
      current_price_baht: true,
      weight_gram: true,
      intl_shipping_type: true,
      bought_at: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
  });

  const candIds = candidates.map((c) => c.id);
  const obligations =
    candIds.length === 0
      ? []
      : await prisma.paymentObligation.findMany({
          where: {
            auction_request_id: { in: candIds },
            obligation_type: { code: { in: ["PRODUCT_FULL", "INTL_SHIPPING"] } },
          },
          include: {
            obligation_type: true,
            transactions: { select: { amount: true } },
          },
        });

  const obByAr = new Map<number, typeof obligations>();
  for (const ob of obligations) {
    if (ob.auction_request_id) {
      const list = obByAr.get(ob.auction_request_id) ?? [];
      list.push(ob);
      obByAr.set(ob.auction_request_id, list);
    }
  }

  const passesIntlFilters = (c: (typeof candidates)[number]): boolean => {
    if (
      !c.intl_shipping_type ||
      (c.intl_shipping_type !== "air" && c.intl_shipping_type !== "sea")
    ) {
      return false;
    }
    const arObs = obByAr.get(c.id) ?? [];
    const snap = computeIntlPaymentSnapshot({
      currentPriceBaht: c.current_price_baht,
      weightGram: c.weight_gram,
      intlShippingType: c.intl_shipping_type,
      boughtAt: c.bought_at,
      obligations: arObs.map((o) => ({
        obligation_type: o.obligation_type,
        amount: o.amount,
        transactions: o.transactions,
      })),
    });
    if (overduePayment && intlOutstanding) {
      return snap.isOverdue;
    }
    if (overduePayment) {
      if (!c.bought_at) return false;
      return snap.isOverdue;
    }
    return snap.intlOutstanding;
  };

  const filtered = candidates.filter(passesIntlFilters);
  const total = filtered.length;
  const pageSlice = filtered.slice(skip, skip + limit);
  const pageIds = pageSlice.map((c) => c.id);

  let unpaidCustomerCopy: string | undefined;
  if (includeUnpaidCustomerCopy && filtered.length > 0) {
    const uids = [
      ...new Set(
        filtered
          .map((c) => c.user_id)
          .filter((id): id is number => id != null),
      ),
    ];
    if (uids.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: uids } },
        select: { user_code: true },
        orderBy: { user_code: "asc" },
      });
      unpaidCustomerCopy = users.map((u) => u.user_code).join(", ");
    } else {
      unpaidCustomerCopy = "";
    }
  }

  if (pageIds.length === 0) {
    return res.json({
      success: true,
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        ...(unpaidCustomerCopy !== undefined
          ? { unpaidCustomerCopy }
          : {}),
      },
    });
  }

  const data = await prisma.auctionRequest.findMany({
    where: { id: { in: pageIds } },
    include: listInclude,
  });
  const orderIndex = new Map(pageIds.map((id, i) => [id, i]));
  data.sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
  );

  return res.json({
    success: true,
    data: data.map(mapAuctionListRow),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
      ...(unpaidCustomerCopy !== undefined
        ? { unpaidCustomerCopy }
        : {}),
    },
  });
}

export async function createAuctionBackoffice(req: Request, res: Response) {
  const result = createAuctionBackofficeSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { errors },
      },
    });
  }

  const { url, firstBidPrice, intl_shipping_type } = result.data;

  let scraped;
  try {
    scraped = await scrapeYahooAuction(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraping failed";
    return res
      .status(422)
      .json({ success: false, error: { code: "SCRAPE_ERROR", message } });
  }

  const { auctionRequest, userCode } = await prisma.$transaction(async (tx) => {
    const userCode = await generateUserCode(tx as Pick<PrismaClient, "user">);
    const user = await tx.user.create({
      data: {
        user_code: userCode,
        external_id: null,
        username: null,
        email: null,
        password: null,
        name: null,
        phone: null,
        role: "CUSTOMER",
        is_email_verified: false,
        is_active: true,
      },
    });

    const auctionRequest = await tx.auctionRequest.create({
      data: {
        user_id: user.id,
        url,
        web: "yahoo",
        item_id: scraped.itemId,
        title: scraped.title,
        image_url: scraped.imageUrl,
        current_price: scraped.currentPrice,
        current_price_baht: jpyToBaht(scraped.currentPrice),
        end_time: scraped.endTime ? new Date(scraped.endTime) : null,
        status: "pending",
        intl_shipping_type,
      },
    });

    const stageTypes = await tx.deliveryStageType.findMany({
      orderBy: { sort_order: "asc" },
    });
    await tx.deliveryStage.createMany({
      data: stageTypes.map((st) => ({
        auction_request_id: auctionRequest.id,
        stage_type_id: st.id,
        status: "PENDING",
      })),
    });

    if (firstBidPrice != null) {
      await tx.auctionPriceLog.create({
        data: {
          auction_request_id: auctionRequest.id,
          price: firstBidPrice,
          bid_count: 1,
        },
      });
    }

    return { auctionRequest, userCode };
  });

  return res.status(201).json({
    success: true,
    data: {
      id: auctionRequest.id,
      userCode,
      title: scraped.title,
      currentPrice: auctionRequest.current_price,
      endTime: scraped.endTime,
      imageUrl: scraped.imageUrl,
      itemId: scraped.itemId,
      status: auctionRequest.status,
      partial: scraped.partial ?? false,
    },
    message: "Auction request created",
  });
}

export async function updateAuctionNote(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid id" },
    });
  }

  const result = updateAuctionNoteSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { errors },
      },
    });
  }

  const existing = await prisma.auctionRequest.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Auction request not found" },
    });
  }

  const updated = await prisma.auctionRequest.update({
    where: { id },
    data: { note: result.data.note },
    include: {
      delivery_stages: {
        include: { stage_type: true },
        orderBy: { stage_type: { sort_order: "asc" } },
      },
    },
  });

  const stages = updated.delivery_stages.map((s) => ({
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
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  return res.json({
    success: true,
    data: {
      id: updated.id,
      userId: updated.user_id,
      url: updated.url,
      web: updated.web,
      itemId: updated.item_id,
      title: updated.title,
      imageUrl: updated.image_url,
      status: updated.status,
      currentPrice: updated.current_price,
      currentPriceBaht: updated.current_price_baht,
      note: updated.note,
      bidResult: updated.bid_result,
      weightGram: updated.weight_gram,
      intlShippingType: updated.intl_shipping_type,
      lotId: updated.lot_id,
      boughtAt: updated.bought_at?.toISOString() ?? null,
      endTime: updated.end_time?.toISOString() ?? null,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
    },
    message: "Note updated",
  });
}

export async function updateAuctionStatus(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid id" },
    });
  }

  const result = updateAuctionStatusSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { errors },
      },
    });
  }

  const existing = await prisma.auctionRequest.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Auction request not found" },
    });
  }

  const updated = await prisma.auctionRequest.update({
    where: { id },
    data: { status: result.data.status },
    include: {
      delivery_stages: {
        include: { stage_type: true },
        orderBy: { stage_type: { sort_order: "asc" } },
      },
    },
  });

  const stages = updated.delivery_stages.map((s) => ({
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
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  return res.json({
    success: true,
    data: {
      id: updated.id,
      userId: updated.user_id,
      url: updated.url,
      web: updated.web,
      itemId: updated.item_id,
      title: updated.title,
      imageUrl: updated.image_url,
      status: updated.status,
      currentPrice: updated.current_price,
      currentPriceBaht: updated.current_price_baht,
      note: updated.note,
      bidResult: updated.bid_result,
      weightGram: updated.weight_gram,
      intlShippingType: updated.intl_shipping_type,
      lotId: updated.lot_id,
      boughtAt: updated.bought_at?.toISOString() ?? null,
      endTime: updated.end_time?.toISOString() ?? null,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
    },
    message: `Status updated to ${result.data.status}`,
  });
}

export async function updateAuctionWeightGram(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid id" },
    });
  }

  const result = updateAuctionWeightGramSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { errors },
      },
    });
  }

  const existing = await prisma.auctionRequest.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Auction request not found" },
    });
  }

  if (
    !existing.intl_shipping_type ||
    (existing.intl_shipping_type !== "air" &&
      existing.intl_shipping_type !== "sea")
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INTL_SHIPPING_TYPE_REQUIRED",
        message:
          "Auction must have intl_shipping_type (air/sea) before updating weight",
      },
    });
  }

  await ensureNextLotExists(existing.intl_shipping_type);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const currentLot = await prisma.lot.findFirst({
    where: {
      intl_shipping_type: existing.intl_shipping_type,
      OR: [{ end_lot_at: null }, { end_lot_at: { gte: today } }],
    },
    orderBy: { id: "desc" },
  });

  const intlShippingRate = existing.intl_shipping_type === "air" ? 0.59 : 0.35;
  const shippingAmount = bahtRoundUp(
    result.data.weight_gram * intlShippingRate,
  );

  const intlShippingType = await prisma.paymentObligationType.findUnique({
    where: { code: "INTL_SHIPPING" },
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.auctionRequest.update({
      where: { id },
      data: {
        weight_gram: result.data.weight_gram,
        ...(currentLot ? { lot_id: currentLot.id } : {}),
      },
    });
    await tx.deliveryStage.updateMany({
      where: { auction_request_id: id, stage_type_id: 1 },
      data: { status: "DELIVERED", delivered_at: new Date() },
    });
    await tx.deliveryStage.updateMany({
      where: { auction_request_id: id, stage_type_id: 2 },
      data: { is_paid: true },
    });

    if (intlShippingType && shippingAmount > 0) {
      const existingObligation = await tx.paymentObligation.findFirst({
        where: {
          auction_request_id: id,
          obligation_type_id: intlShippingType.id,
        },
      });
      const dueDate = existing.bought_at ?? existing.end_time ?? new Date();
      if (existingObligation) {
        await tx.paymentObligation.update({
          where: { id: existingObligation.id },
          data: {
            amount: shippingAmount,
            ...(existing.user_id && { user_id: existing.user_id }),
          },
        });
      } else {
        await tx.paymentObligation.create({
          data: {
            auction_request_id: id,
            user_id: existing.user_id ?? undefined,
            obligation_type_id: intlShippingType.id,
            amount: shippingAmount,
            currency: "THB",
            due_date: dueDate,
            status: "PENDING",
          },
        });
      }
    }

    return tx.auctionRequest.findUniqueOrThrow({
      where: { id },
      include: {
        lot: true,
        delivery_stages: {
          include: { stage_type: true },
          orderBy: { stage_type: { sort_order: "asc" } },
        },
      },
    });
  });

  if (existing.user_id) {
    await sweepWalletToObligations({
      userId: existing.user_id,
      sweepKey: `weight-update-${id}-${Date.now()}`,
    });
  }

  const stages = updated.delivery_stages.map((s) => ({
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
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  return res.json({
    success: true,
    data: {
      id: updated.id,
      userId: updated.user_id,
      url: updated.url,
      web: updated.web,
      itemId: updated.item_id,
      title: updated.title,
      imageUrl: updated.image_url,
      status: updated.status,
      currentPrice: updated.current_price,
      currentPriceBaht: updated.current_price_baht,
      note: updated.note,
      bidResult: updated.bid_result,
      weightGram: updated.weight_gram,
      intlShippingType: updated.intl_shipping_type,
      lotId: updated.lot_id,
      boughtAt: updated.bought_at?.toISOString() ?? null,
      endTime: updated.end_time?.toISOString() ?? null,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
      lot: updated.lot
        ? {
            id: updated.lot.id,
            lot_code: updated.lot.lot_code,
            intl_shipping_type: updated.lot.intl_shipping_type,
            start_lot_at: updated.lot.start_lot_at?.toISOString() ?? null,
            end_lot_at: updated.lot.end_lot_at?.toISOString() ?? null,
            arrive_at: updated.lot.arrive_at?.toISOString() ?? null,
          }
        : null,
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
    },
    message: "Weight updated",
  });
}

export async function updateDomesticShipping(req: Request, res: Response) {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_USER_ID",
        message: `Invalid userId: "${req.params.userId}" is not a number`,
      },
    });
  }

  const result = updateDomesticShippingSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { errors },
      },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `User id ${userId} not found`,
      },
    });
  }

  const domesticShippingType = await prisma.paymentObligationType.findUnique({
    where: { code: "DOMESTIC_SHIPPING" },
  });
  if (!domesticShippingType) {
    return res.status(500).json({
      success: false,
      error: {
        code: "MISSING_TYPE",
        message:
          "DOMESTIC_SHIPPING obligation type not found in payment_obligation_types table",
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    const existingObligation = await tx.paymentObligation.findFirst({
      where: {
        user_id: userId,
        obligation_type_id: domesticShippingType.id,
        status: "PENDING",
      },
      orderBy: { id: "asc" },
    });
    if (existingObligation) {
      await tx.paymentObligation.update({
        where: { id: existingObligation.id },
        data: {
          amount: result.data.amount_baht,
          auction_request_id: null,
        },
      });
    } else {
      await tx.paymentObligation.create({
        data: {
          auction_request_id: null,
          user_id: userId,
          obligation_type_id: domesticShippingType.id,
          amount: result.data.amount_baht,
          currency: "THB",
          due_date: new Date(),
          status: "PENDING",
        },
      });
    }
  });

  return res.json({
    success: true,
    data: { userId, amountBaht: result.data.amount_baht },
    message: "Domestic shipping updated",
  });
}

/** Users with items ready for domestic batch: lot arrived (is_arrived), intl+product PAID, stage 3 not paid yet. */
export async function listDomesticShippingQueue(req: Request, res: Response) {
  const stageTypeId = await getDomesticCustomerStageTypeId();

  const pendingAr = await prisma.auctionRequest.findMany({
    where: {
      user_id: { not: null },
      lot_id: { not: null },
      lot: { is_arrived: true },
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
    },
    include: {
      user: { select: { id: true, user_code: true, username: true } },
      lot: {
        select: { id: true, lot_code: true, is_arrived: true, arrive_at: true },
      },
    },
  });

  const byUser = new Map<number, typeof pendingAr>();
  for (const ar of pendingAr) {
    if (ar.user_id == null) continue;
    const list = byUser.get(ar.user_id) ?? [];
    list.push(ar);
    byUser.set(ar.user_id, list);
  }

  const userIds = [...byUser.keys()];
  const domesticType = await prisma.paymentObligationType.findUnique({
    where: { code: "DOMESTIC_SHIPPING" },
  });

  const domesticObs =
    domesticType && userIds.length > 0
      ? await prisma.paymentObligation.findMany({
          where: {
            user_id: { in: userIds },
            obligation_type_id: domesticType.id,
            status: "PENDING",
          },
        })
      : [];

  const domByUser = new Map(
    domesticObs.filter((o) => o.user_id != null).map((o) => [o.user_id!, o]),
  );

  const data = userIds
    .sort((a, b) => {
      const ua = byUser.get(a)?.[0]?.user?.user_code ?? "";
      const ub = byUser.get(b)?.[0]?.user?.user_code ?? "";
      return ua.localeCompare(ub);
    })
    .map((uid) => {
      const ars = byUser.get(uid)!;
      const u = ars[0].user;
      const seenLots = new Set<number>();
      const lots: {
        id: number;
        lotCode: string | null;
        isArrived: boolean;
        arriveAt: string | null;
      }[] = [];
      for (const ar of ars) {
        if (ar.lot_id && ar.lot && !seenLots.has(ar.lot.id)) {
          seenLots.add(ar.lot.id);
          lots.push({
            id: ar.lot.id,
            lotCode: ar.lot.lot_code,
            isArrived: ar.lot.is_arrived,
            arriveAt: ar.lot.arrive_at?.toISOString() ?? null,
          });
        }
      }
      const ob = domByUser.get(uid);
      return {
        userId: uid,
        userCode: u?.user_code ?? null,
        username: u?.username ?? null,
        pendingDomesticItemCount: ars.length,
        lots,
        domesticPendingBaht: ob?.amount ?? null,
      };
    });

  return res.json({ success: true, data });
}

/**
 * Drill-down for modal: all auction items for one user that match the same domestic-queue rules
 * as GET /domestic-shipping-queue (lot arrived, product+intl PAID, stage 3 is_paid false).
 */
export async function getDomesticShippingQueueItems(
  req: Request,
  res: Response,
) {
  const userId = parseInt(req.params.userId, 10);
  if (Number.isNaN(userId)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "userId must be a number" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, user_code: true, username: true },
  });
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "User not found" },
    });
  }

  const payload = await getDomesticShippingPendingItemsForUser(userId);

  return res.json({
    success: true,
    data: {
      userId: user.id,
      userCode: user.user_code,
      username: user.username,
      ...payload,
    },
  });
}

export async function assignLotToAuction(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid id" },
    });
  }

  const result = assignLotToAuctionSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { errors },
      },
    });
  }

  const existing = await prisma.auctionRequest.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Auction request not found" },
    });
  }

  const updated = await prisma.auctionRequest.update({
    where: { id },
    data: { lot_id: result.data.lot_id },
    include: {
      lot: true,
      delivery_stages: {
        include: { stage_type: true },
        orderBy: { stage_type: { sort_order: "asc" } },
      },
    },
  });

  const stages = updated.delivery_stages.map((s) => ({
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
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  return res.json({
    success: true,
    data: {
      id: updated.id,
      userId: updated.user_id,
      url: updated.url,
      web: updated.web,
      itemId: updated.item_id,
      title: updated.title,
      imageUrl: updated.image_url,
      status: updated.status,
      currentPrice: updated.current_price,
      currentPriceBaht: updated.current_price_baht,
      note: updated.note,
      bidResult: updated.bid_result,
      weightGram: updated.weight_gram,
      intlShippingType: updated.intl_shipping_type,
      lotId: updated.lot_id,
      boughtAt: updated.bought_at?.toISOString() ?? null,
      endTime: updated.end_time?.toISOString() ?? null,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
      lot: updated.lot
        ? {
            id: updated.lot.id,
            lot_code: updated.lot.lot_code,
            intl_shipping_type: updated.lot.intl_shipping_type,
            start_lot_at: updated.lot.start_lot_at?.toISOString() ?? null,
            end_lot_at: updated.lot.end_lot_at?.toISOString() ?? null,
            arrive_at: updated.lot.arrive_at?.toISOString() ?? null,
          }
        : null,
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
    },
    message: "Lot assigned",
  });
}
