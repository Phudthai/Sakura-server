/**
 * @file overview.controller.ts
 * @description Backoffice overview stats
 */

import { Request, Response } from "express"
import { prisma } from "../../../packages/database/src"
import { getOverviewStats } from "../../services/backoffice-overview.service"

export async function getOverviewStatsHandler(req: Request, res: Response) {
  const typeRaw = req.query.type as string | undefined
  if (typeRaw !== "air" && typeRaw !== "sea") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: 'Query "type" is required and must be "air" or "sea"',
      },
    })
  }
  const intlShippingType = typeRaw

  const raw = req.query.lot_id as string | undefined
  let lotId: number | null = null
  if (raw !== undefined && raw !== "") {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < 1) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "lot_id must be a positive integer" },
      })
    }
    const lot = await prisma.lot.findUnique({
      where: { id: n },
      select: { id: true, intl_shipping_type: true },
    })
    if (!lot) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Lot not found" },
      })
    }
    if (lot.intl_shipping_type !== intlShippingType) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `lot_id refers to a ${lot.intl_shipping_type} lot; type must match`,
        },
      })
    }
    lotId = n
  }

  const data = await getOverviewStats({ lotId, intlShippingType })
  return res.json({ success: true, data })
}
