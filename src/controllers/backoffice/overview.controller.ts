/**
 * @file overview.controller.ts
 * @description Backoffice overview stats
 */

import { Request, Response } from "express";
import { parseMonthParam } from "../../../packages/shared/src";
import {
  getOverviewDistinctMonths,
  getOverviewStats,
} from "../../services/backoffice-overview.service";

export async function getOverviewStatsHandler(req: Request, res: Response) {
  const typeRaw = req.query.type as string | undefined;
  if (typeRaw !== "air" && typeRaw !== "sea") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: 'Query "type" is required and must be "air" or "sea"',
      },
    });
  }
  const intlShippingType = typeRaw;

  const parsedMonth = parseMonthParam(
    (req.query.month as string) ?? "",
    req.query.year as string | undefined,
  );
  if (!parsedMonth) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          'Query "month" is required: use 1-12 with optional year, or year-month (e.g. 2026-3)',
      },
    });
  }

  const modeRaw = (req.query.purchase_mode as string | undefined) ?? "all";
  let purchaseMode: "all" | "AUCTION" | "BUYOUT";
  if (modeRaw === "all") {
    purchaseMode = "all";
  } else if (modeRaw === "AUCTION" || modeRaw === "BUYOUT") {
    purchaseMode = modeRaw;
  } else {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          'Query "purchase_mode" must be "all", "AUCTION", or "BUYOUT" (default: all)',
      },
    });
  }

  const data = await getOverviewStats({
    intlShippingType,
    year: parsedMonth.year,
    month: parsedMonth.month,
    purchaseMode,
  });
  return res.json({ success: true, data });
}

/** Months (YYYY-M, Bangkok) that have completed rows — same scope filters as GET overview/stats (no month param). */
export async function getOverviewMonthsHandler(req: Request, res: Response) {
  const typeRaw = req.query.type as string | undefined;
  if (typeRaw !== "air" && typeRaw !== "sea") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: 'Query "type" is required and must be "air" or "sea"',
      },
    });
  }
  const intlShippingType = typeRaw;

  const modeRaw = (req.query.purchase_mode as string | undefined) ?? "all";
  let purchaseMode: "all" | "AUCTION" | "BUYOUT";
  if (modeRaw === "all") {
    purchaseMode = "all";
  } else if (modeRaw === "AUCTION" || modeRaw === "BUYOUT") {
    purchaseMode = modeRaw;
  } else {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          'Query "purchase_mode" must be "all", "AUCTION", or "BUYOUT" (default: all)',
      },
    });
  }

  const months = await getOverviewDistinctMonths({
    intlShippingType,
    purchaseMode,
  });
  return res.json({ success: true, data: { months } });
}

