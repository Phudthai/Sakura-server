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
  assignLotToAuctionSchema,
  jpyToBaht,
  bahtRoundUp,
} from "../../../packages/shared/src";
import { scrapeYahooAuction } from "../../services/auction-scraper.service";
import { ensureNextLotExists } from "../../services/lot.service";

export async function listAuctionsBackoffice(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const user_code = req.query.user_code as string | undefined;

  const delivery_stage = req.query.delivery_stage as string | undefined;
  const shipping_type = req.query.shipping_type as string | undefined;

  // delivery_stage: 0=type1 PENDING (ยังไม่ถึงบ้านญี่ปุ่น), 1+=type_id DELIVERED
  let deliveryStageFilter: { deliveryStages: { some: { stageTypeId: number; status: string } } } | object = {};
  if (delivery_stage === "0") {
    deliveryStageFilter = {
      deliveryStages: { some: { stageTypeId: 1, status: "PENDING" } },
    };
  } else if (delivery_stage) {
    const typeId = parseInt(delivery_stage, 10);
    if (!Number.isNaN(typeId) && typeId >= 1) {
      deliveryStageFilter = {
        deliveryStages: { some: { stageTypeId: typeId, status: "DELIVERED" } },
      };
    }
  }

  const where = {
    ...(status ? { status } : {}),
    ...(user_code
      ? { user: { OR: [{ userCode: user_code }, { username: user_code }] } }
      : {}),
    ...(shipping_type && (shipping_type === "air" || shipping_type === "sea")
      ? { intlShippingType: shipping_type }
      : {}),
    ...deliveryStageFilter,
  };

  const [data, total] = await Promise.all([
    prisma.auctionRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        priceLogs: { orderBy: { recordedAt: "desc" }, take: 1 },
        user: { select: { userCode: true, username: true, externalId: true } },
        lot: true,
        deliveryStages: {
          include: { stageType: true },
          orderBy: { stageType: { sortOrder: "asc" } },
        },
      },
    }),
    prisma.auctionRequest.count({ where }),
  ]);

  return res.json({
    success: true,
    data: data.map((r) => {
      const lastBid = r.priceLogs[0];
      const stages = r.deliveryStages.map((s) => ({
        id: s.id,
        stageTypeCode: s.stageType.code,
        stageTypeNameTh: s.stageType.nameTh,
        status: s.status,
        trackingNumber: s.trackingNumber ?? null,
        carrier: s.carrier ?? null,
        shippedAt: s.shippedAt?.toISOString() ?? null,
        deliveredAt: s.deliveredAt?.toISOString() ?? null,
      }));
      const isDeliveried =
        stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
      const {
        priceLogs,
        user,
        deliveryStages: _ds,
        lot,
        web: _w,
        itemId: _i,
        bidResult: _b,
        boughtAt: _ba,
        createdAt: _c,
        updatedAt: _u,
        ...rest
      } = r;
      return {
        ...rest,
        userCode: user?.userCode ?? null,
        username: user?.username ?? null,
        externalId: user?.externalId ?? null,
        register_url: user?.userCode
          ? `${process.env.FRONTEND_URL ?? ""}/register?user_code=${user.userCode}`
          : null,
        lastBid: lastBid
          ? { price: lastBid.price, status: lastBid.status }
          : null,
        lot: lot
          ? {
              id: lot.id,
              lot_code: lot.lotCode,
              intl_shipping_type: lot.intlShippingType,
              start_lot_at: lot.startLotAt?.toISOString() ?? null,
              end_lot_at: lot.endLotAt?.toISOString() ?? null,
              arrive_at: lot.arriveAt?.toISOString() ?? null,
            }
          : null,
        deliveryStages: stages,
        isDeliveried,
        endTime: r.endTime?.toISOString() ?? null,
      };
    }),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
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
        userCode,
        externalId: null,
        username: null,
        email: null,
        password: null,
        name: null,
        phone: null,
        role: "CUSTOMER",
        isEmailVerified: false,
        isActive: true,
      },
    });

    const auctionRequest = await tx.auctionRequest.create({
      data: {
        userId: user.id,
        url,
        web: "yahoo",
        itemId: scraped.itemId,
        title: scraped.title,
        imageUrl: scraped.imageUrl,
        currentPrice: scraped.currentPrice,
        currentPriceBaht: jpyToBaht(scraped.currentPrice),
        endTime: scraped.endTime ? new Date(scraped.endTime) : null,
        status: "pending",
        intlShippingType: intl_shipping_type,
      },
    });

    const stageTypes = await tx.deliveryStageType.findMany({
      orderBy: { sortOrder: "asc" },
    });
    await tx.deliveryStage.createMany({
      data: stageTypes.map((st) => ({
        auctionRequestId: auctionRequest.id,
        stageTypeId: st.id,
        status: "PENDING",
      })),
    });

    if (firstBidPrice != null) {
      await tx.auctionPriceLog.create({
        data: {
          auctionRequestId: auctionRequest.id,
          price: firstBidPrice,
          bidCount: 1,
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
      currentPrice: auctionRequest.currentPrice,
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
      deliveryStages: {
        include: { stageType: true },
        orderBy: { stageType: { sortOrder: "asc" } },
      },
    },
  });

  const stages = updated.deliveryStages.map((s) => ({
    id: s.id,
    stageTypeCode: s.stageType.code,
    stageTypeNameTh: s.stageType.nameTh,
    status: s.status,
    trackingNumber: s.trackingNumber ?? null,
    carrier: s.carrier ?? null,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }));
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  const { deliveryStages: _ds, ...rest } = updated;

  return res.json({
    success: true,
    data: {
      ...rest,
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
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
      deliveryStages: {
        include: { stageType: true },
        orderBy: { stageType: { sortOrder: "asc" } },
      },
    },
  });

  const stages = updated.deliveryStages.map((s) => ({
    id: s.id,
    stageTypeCode: s.stageType.code,
    stageTypeNameTh: s.stageType.nameTh,
    status: s.status,
    trackingNumber: s.trackingNumber ?? null,
    carrier: s.carrier ?? null,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }));
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  const { deliveryStages: _ds, ...rest } = updated;

  return res.json({
    success: true,
    data: {
      ...rest,
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
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
    !existing.intlShippingType ||
    (existing.intlShippingType !== "air" && existing.intlShippingType !== "sea")
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

  await ensureNextLotExists(existing.intlShippingType);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const currentLot = await prisma.lot.findFirst({
    where: {
      intlShippingType: existing.intlShippingType,
      OR: [{ endLotAt: null }, { endLotAt: { gte: today } }],
    },
    orderBy: { id: "desc" },
  });

  const intlShippingRate =
    existing.intlShippingType === "air" ? 0.59 : 0.35;
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
        weightGram: result.data.weight_gram,
        ...(currentLot ? { lotId: currentLot.id } : {}),
      },
    });
    await tx.deliveryStage.updateMany({
      where: { auctionRequestId: id, stageTypeId: 1 },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });

    if (intlShippingType && shippingAmount > 0) {
      const existingObligation = await tx.paymentObligation.findFirst({
        where: {
          auctionRequestId: id,
          obligationTypeId: intlShippingType.id,
        },
      });
      const dueDate = existing.boughtAt ?? existing.endTime ?? new Date();
      if (existingObligation) {
        await tx.paymentObligation.update({
          where: { id: existingObligation.id },
          data: {
            amount: shippingAmount,
            ...(existing.userId && { userId: existing.userId }),
          },
        });
      } else {
        await tx.paymentObligation.create({
          data: {
            auctionRequestId: id,
            userId: existing.userId ?? undefined,
            obligationTypeId: intlShippingType.id,
            amount: shippingAmount,
            currency: "THB",
            dueDate,
            status: "PENDING",
          },
        });
      }
    }

    return tx.auctionRequest.findUniqueOrThrow({
      where: { id },
      include: {
        lot: true,
        deliveryStages: {
          include: { stageType: true },
          orderBy: { stageType: { sortOrder: "asc" } },
        },
      },
    });
  });

  const stages = updated.deliveryStages.map((s) => ({
    id: s.id,
    stageTypeCode: s.stageType.code,
    stageTypeNameTh: s.stageType.nameTh,
    status: s.status,
    trackingNumber: s.trackingNumber ?? null,
    carrier: s.carrier ?? null,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }));
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  const { deliveryStages: _ds, lot, ...rest } = updated;

  return res.json({
    success: true,
    data: {
      ...rest,
      lot: lot
        ? {
            id: lot.id,
            lot_code: lot.lotCode,
            intl_shipping_type: lot.intlShippingType,
            start_lot_at: lot.startLotAt?.toISOString() ?? null,
            end_lot_at: lot.endLotAt?.toISOString() ?? null,
            arrive_at: lot.arriveAt?.toISOString() ?? null,
          }
        : null,
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: "Weight updated",
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
    data: { lotId: result.data.lot_id },
    include: {
      lot: true,
      deliveryStages: {
        include: { stageType: true },
        orderBy: { stageType: { sortOrder: "asc" } },
      },
    },
  });

  const stages = updated.deliveryStages.map((s) => ({
    id: s.id,
    stageTypeCode: s.stageType.code,
    stageTypeNameTh: s.stageType.nameTh,
    status: s.status,
    trackingNumber: s.trackingNumber ?? null,
    carrier: s.carrier ?? null,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }));
  const isDeliveried =
    stages.length > 0 && stages.every((s) => s.status === "DELIVERED");
  const { deliveryStages: _ds, lot, ...rest } = updated;

  return res.json({
    success: true,
    data: {
      ...rest,
      lot: lot
        ? {
            id: lot.id,
            lot_code: lot.lotCode,
            intl_shipping_type: lot.intlShippingType,
            start_lot_at: lot.startLotAt?.toISOString() ?? null,
            end_lot_at: lot.endLotAt?.toISOString() ?? null,
            arrive_at: lot.arriveAt?.toISOString() ?? null,
          }
        : null,
      deliveryStages: stages,
      isDeliveried,
      shippingPrice: null,
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: "Lot assigned",
  });
}
