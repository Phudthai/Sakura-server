/**
 * @file lot.controller.ts
 * @description Backoffice lot management
 */

import { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../packages/database/src";
import { createLotSchema, updateLotSchema } from "../../../packages/shared/src";
import { markIntlThailandStageDeliveredForLot } from "../../services/lot-delivery.service";

function mapLotListItem(l: {
  id: number;
  lot_code: string;
  intl_shipping_type: string;
  start_lot_at: Date | null;
  end_lot_at: Date | null;
  arrive_at: Date | null;
  is_arrived: boolean;
  is_delayed: boolean;
  created_at: Date;
  updated_at: Date;
  _count: { auction_requests: number };
}) {
  return {
    id: l.id,
    lot_code: l.lot_code,
    intl_shipping_type: l.intl_shipping_type,
    start_lot_at: l.start_lot_at?.toISOString() ?? null,
    end_lot_at: l.end_lot_at?.toISOString() ?? null,
    arrive_at: l.arrive_at?.toISOString() ?? null,
    is_arrived: l.is_arrived,
    is_delayed: l.is_delayed,
    auction_count: l._count.auction_requests,
    createdAt: l.created_at.toISOString(),
    updatedAt: l.updated_at.toISOString(),
  };
}

/** Lots ที่มีอย่างน้อย 1 รายการประมูลที่ใส่น้ำหนักแล้ว (weight_gram > 0) */
const lotWhereHasWeightGram: Prisma.LotWhereInput = {
  auction_requests: {
    some: { weight_gram: { gt: 0 } },
  },
};

export async function listLotsGroupedByShippingType(
  req: Request,
  res: Response,
) {
  const raw =
    (req.query.shipping_type as string | undefined) ??
    (req.query.intl_shipping_type as string | undefined);
  const filter =
    raw === "air" || raw === "sea" ? (raw as "air" | "sea") : null;

  const include = { _count: { select: { auction_requests: true } } as const };

  if (filter) {
    const rows = await prisma.lot.findMany({
      where: {
        intl_shipping_type: filter,
        ...lotWhereHasWeightGram,
      },
      orderBy: { id: "desc" },
      include,
    });
    const mapped = rows.map(mapLotListItem);
    return res.json({
      success: true,
      data: {
        air: filter === "air" ? mapped : [],
        sea: filter === "sea" ? mapped : [],
      },
    });
  }

  const [air, sea] = await Promise.all([
    prisma.lot.findMany({
      where: {
        intl_shipping_type: "air",
        ...lotWhereHasWeightGram,
      },
      orderBy: { id: "desc" },
      include,
    }),
    prisma.lot.findMany({
      where: {
        intl_shipping_type: "sea",
        ...lotWhereHasWeightGram,
      },
      orderBy: { id: "desc" },
      include,
    }),
  ]);

  return res.json({
    success: true,
    data: {
      air: air.map(mapLotListItem),
      sea: sea.map(mapLotListItem),
    },
  });
}

export async function listLots(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const intl_shipping_type = req.query.intl_shipping_type as string | undefined;

  const where =
    intl_shipping_type &&
    (intl_shipping_type === "air" || intl_shipping_type === "sea")
      ? { intl_shipping_type: intl_shipping_type }
      : {};

  const [data, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { auction_requests: true } },
      },
    }),
    prisma.lot.count({ where }),
  ]);

  return res.json({
    success: true,
    data: data.map(mapLotListItem),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
}

export async function createLot(req: Request, res: Response) {
  const result = createLotSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { errors },
        },
      });
  }

  const existing = await prisma.lot.findUnique({
    where: {
      lot_code_intl_shipping_type: {
        lot_code: result.data.lot_code,
        intl_shipping_type: result.data.intl_shipping_type,
      },
    },
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: {
        code: "LOT_CODE_EXISTS",
        message: `Lot code "${result.data.lot_code}" (${result.data.intl_shipping_type}) already exists`,
      },
    });
  }

  const lot = await prisma.$transaction(async (tx) => {
    const created = await tx.lot.create({
      data: {
        lot_code: result.data.lot_code,
        intl_shipping_type: result.data.intl_shipping_type,
        start_lot_at: result.data.start_lot_at ?? null,
        end_lot_at: result.data.end_lot_at ?? null,
        arrive_at: result.data.arrive_at ?? null,
        is_arrived: result.data.is_arrived ?? false,
        is_delayed: result.data.is_delayed ?? false,
      },
    });
    if (created.is_arrived) {
      await markIntlThailandStageDeliveredForLot(created.id, tx);
    }
    return created;
  });

  return res.status(201).json({
    success: true,
    data: {
      id: lot.id,
      lot_code: lot.lot_code,
      intl_shipping_type: lot.intl_shipping_type,
      start_lot_at: lot.start_lot_at?.toISOString() ?? null,
      end_lot_at: lot.end_lot_at?.toISOString() ?? null,
      arrive_at: lot.arrive_at?.toISOString() ?? null,
      is_arrived: lot.is_arrived,
      is_delayed: lot.is_delayed,
      createdAt: lot.created_at.toISOString(),
      updatedAt: lot.updated_at.toISOString(),
    },
    message: `Lot "${lot.lot_code}" created`,
  });
}

export async function updateLot(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res
      .status(400)
      .json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid id" },
      });
  }

  const result = updateLotSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { errors },
        },
      });
  }

  const existing = await prisma.lot.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({
        success: false,
        error: { code: "NOT_FOUND", message: "Lot not found" },
      });
  }

  const checkCode = result.data.lot_code ?? existing.lot_code;
  const checkType =
    result.data.intl_shipping_type ?? existing.intl_shipping_type;
  if (
    (result.data.lot_code && result.data.lot_code !== existing.lot_code) ||
    (result.data.intl_shipping_type &&
      result.data.intl_shipping_type !== existing.intl_shipping_type)
  ) {
    const duplicate = await prisma.lot.findUnique({
      where: {
        lot_code_intl_shipping_type: {
          lot_code: checkCode,
          intl_shipping_type: checkType,
        },
      },
    });
    if (duplicate && duplicate.id !== id) {
      return res.status(409).json({
        success: false,
        error: {
          code: "LOT_CODE_EXISTS",
          message: `Lot code "${checkCode}" (${checkType}) already exists`,
        },
      });
    }
  }

  const data: {
    lot_code?: string;
    intl_shipping_type?: string;
    start_lot_at?: Date | null;
    end_lot_at?: Date | null;
    arrive_at?: Date | null;
    is_arrived?: boolean;
    is_delayed?: boolean;
  } = {};
  if (result.data.lot_code != null) data.lot_code = result.data.lot_code;
  if (result.data.intl_shipping_type != null)
    data.intl_shipping_type = result.data.intl_shipping_type;
  if (result.data.start_lot_at !== undefined)
    data.start_lot_at = result.data.start_lot_at ?? null;
  if (result.data.end_lot_at !== undefined)
    data.end_lot_at = result.data.end_lot_at ?? null;
  if (result.data.arrive_at !== undefined)
    data.arrive_at = result.data.arrive_at ?? null;
  if (result.data.is_arrived !== undefined)
    data.is_arrived = result.data.is_arrived;
  if (result.data.is_delayed !== undefined)
    data.is_delayed = result.data.is_delayed;

  const updated = await prisma.$transaction(async (tx) => {
    const lotRow = await tx.lot.update({
      where: { id },
      data,
    });
    if (lotRow.is_arrived) {
      await markIntlThailandStageDeliveredForLot(lotRow.id, tx);
    }
    return lotRow;
  });

  return res.json({
    success: true,
    data: {
      id: updated.id,
      lot_code: updated.lot_code,
      intl_shipping_type: updated.intl_shipping_type,
      start_lot_at: updated.start_lot_at?.toISOString() ?? null,
      end_lot_at: updated.end_lot_at?.toISOString() ?? null,
      arrive_at: updated.arrive_at?.toISOString() ?? null,
      is_arrived: updated.is_arrived,
      is_delayed: updated.is_delayed,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
    },
    message: "Lot updated",
  });
}
