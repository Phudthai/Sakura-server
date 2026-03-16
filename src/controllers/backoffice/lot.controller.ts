/**
 * @file lot.controller.ts
 * @description Backoffice lot management
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import { createLotSchema, updateLotSchema } from '../../../packages/shared/src'

export async function listLots(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const intl_shipping_type = req.query.intl_shipping_type as string | undefined

  const where =
    intl_shipping_type && (intl_shipping_type === 'air' || intl_shipping_type === 'sea')
      ? { intlShippingType: intl_shipping_type }
      : {}

  const [data, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
      include: {
        _count: { select: { auctionRequests: true } },
      },
    }),
    prisma.lot.count({ where }),
  ])

  return res.json({
    success: true,
    data: data.map((l) => ({
      id: l.id,
      lot_code: l.lotCode,
      intl_shipping_type: l.intlShippingType,
      start_lot_at: l.startLotAt?.toISOString() ?? null,
      end_lot_at: l.endLotAt?.toISOString() ?? null,
      arrive_at: l.arriveAt?.toISOString() ?? null,
      auction_count: l._count.auctionRequests,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  })
}

export async function createLot(req: Request, res: Response) {
  const result = createLotSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const existing = await prisma.lot.findUnique({
    where: {
      lotCode_intlShippingType: {
        lotCode: result.data.lot_code,
        intlShippingType: result.data.intl_shipping_type,
      },
    },
  })
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'LOT_CODE_EXISTS', message: `Lot code "${result.data.lot_code}" (${result.data.intl_shipping_type}) already exists` },
    })
  }

  const lot = await prisma.lot.create({
    data: {
      lotCode: result.data.lot_code,
      intlShippingType: result.data.intl_shipping_type,
      startLotAt: result.data.start_lot_at ?? null,
      endLotAt: result.data.end_lot_at ?? null,
      arriveAt: result.data.arrive_at ?? null,
    },
  })

  return res.status(201).json({
    success: true,
    data: {
      id: lot.id,
      lot_code: lot.lotCode,
      intl_shipping_type: lot.intlShippingType,
      start_lot_at: lot.startLotAt?.toISOString() ?? null,
      end_lot_at: lot.endLotAt?.toISOString() ?? null,
      arrive_at: lot.arriveAt?.toISOString() ?? null,
      createdAt: lot.createdAt.toISOString(),
      updatedAt: lot.updatedAt.toISOString(),
    },
    message: `Lot "${lot.lotCode}" created`,
  })
}

export async function updateLot(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = updateLotSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const existing = await prisma.lot.findUnique({ where: { id } })
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lot not found' } })
  }

  const checkCode = result.data.lot_code ?? existing.lotCode
  const checkType = result.data.intl_shipping_type ?? existing.intlShippingType
  if (
    (result.data.lot_code && result.data.lot_code !== existing.lotCode) ||
    (result.data.intl_shipping_type && result.data.intl_shipping_type !== existing.intlShippingType)
  ) {
    const duplicate = await prisma.lot.findUnique({
      where: {
        lotCode_intlShippingType: {
          lotCode: checkCode,
          intlShippingType: checkType,
        },
      },
    })
    if (duplicate && duplicate.id !== id) {
      return res.status(409).json({
        success: false,
        error: { code: 'LOT_CODE_EXISTS', message: `Lot code "${checkCode}" (${checkType}) already exists` },
      })
    }
  }

  const data: {
    lotCode?: string
    intlShippingType?: string
    startLotAt?: Date | null
    endLotAt?: Date | null
    arriveAt?: Date | null
  } = {}
  if (result.data.lot_code != null) data.lotCode = result.data.lot_code
  if (result.data.intl_shipping_type != null) data.intlShippingType = result.data.intl_shipping_type
  if (result.data.start_lot_at !== undefined) data.startLotAt = result.data.start_lot_at ?? null
  if (result.data.end_lot_at !== undefined) data.endLotAt = result.data.end_lot_at ?? null
  if (result.data.arrive_at !== undefined) data.arriveAt = result.data.arrive_at ?? null

  const updated = await prisma.lot.update({
    where: { id },
    data,
  })

  return res.json({
    success: true,
    data: {
      id: updated.id,
      lot_code: updated.lotCode,
      intl_shipping_type: updated.intlShippingType,
      start_lot_at: updated.startLotAt?.toISOString() ?? null,
      end_lot_at: updated.endLotAt?.toISOString() ?? null,
      arrive_at: updated.arriveAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: 'Lot updated',
  })
}
