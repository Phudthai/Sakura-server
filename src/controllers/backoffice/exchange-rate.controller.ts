/**
 * @file exchange-rate.controller.ts
 * @description Backoffice JPY→THB tier configuration
 */

import { Request, Response } from "express";
import { prisma } from "../../../packages/database/src";
import {
  putJpyThbTiersBodySchema,
  validateJpyThbTiersPartition,
} from "../../../packages/shared/src";
import { reloadJpyThbTiers } from "../../services/exchange-rate.service";

function mapTier(r: {
  id: number;
  min_jpy: number;
  max_jpy: number | null;
  rate: unknown;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: r.id,
    minJpy: r.min_jpy,
    maxJpy: r.max_jpy,
    rate: Number(r.rate),
    sortOrder: r.sort_order,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getJpyThbTiers(_req: Request, res: Response) {
  const rows = await prisma.jpyThbRateTier.findMany({
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
  });
  return res.json({
    success: true,
    data: {
      tiers: rows.map(mapTier),
    },
  });
}

export async function putJpyThbTiers(req: Request, res: Response) {
  const parsed = putJpyThbTiersBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: errors },
    });
  }

  const partitionErr = validateJpyThbTiersPartition(parsed.data.tiers);
  if (partitionErr) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_TIERS", message: partitionErr },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.jpyThbRateTier.deleteMany({});
    await tx.jpyThbRateTier.createMany({
      data: parsed.data.tiers.map((t) => ({
        min_jpy: t.minJpy,
        max_jpy: t.maxJpy,
        rate: t.rate,
        sort_order: t.sortOrder,
      })),
    });
  });

  await reloadJpyThbTiers();

  const rows = await prisma.jpyThbRateTier.findMany({
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
  });

  return res.json({
    success: true,
    data: {
      tiers: rows.map(mapTier),
    },
    message: "JPY→THB tiers updated",
  });
}
