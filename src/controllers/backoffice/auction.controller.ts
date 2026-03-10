/**
 * @file auction.controller.ts
 * @description Backoffice auction request operations
 */

import { Request, Response } from 'express'
import type { PrismaClient } from '@prisma/client'
import { prisma, generateUserCode } from '../../../packages/database/src'
import {
  createAuctionBackofficeSchema,
  updateAuctionStatusSchema,
  updateAuctionNoteSchema,
  jpyToBaht,
} from '../../../packages/shared/src'
import { scrapeYahooAuction } from '../../services/auction-scraper.service'

export async function listAuctionsBackoffice(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const status = req.query.status as string | undefined
  const user_code = req.query.user_code as string | undefined

  const where = {
    ...(status ? { status } : {}),
    ...(user_code
      ? { user: { OR: [{ userCode: user_code }, { username: user_code }] } }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.auctionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        priceLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
        user: { select: { userCode: true, username: true, externalId: true } },
      },
    }),
    prisma.auctionRequest.count({ where }),
  ])

  return res.json({
    success: true,
    data: data.map((r) => {
      const lastBid = r.priceLogs[0]
      const {
        priceLogs,
        user,
        web: _w,
        itemId: _i,
        bidResult: _b,
        weightGram: _wg,
        intlShippingType: _ist,
        lot: _l,
        boughtAt: _ba,
        createdAt: _c,
        updatedAt: _u,
        ...rest
      } = r
      return {
        ...rest,
        userCode: user?.userCode ?? null,
        username: user?.username ?? null,
        externalId: user?.externalId ?? null,
        register_url: user?.userCode
          ? `${process.env.FRONTEND_URL ?? ''}/register?user_code=${user.userCode}`
          : null,
        lastBid: lastBid ? { price: lastBid.price, status: lastBid.status } : null,
        endTime: r.endTime?.toISOString() ?? null,
      }
    }),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  })
}

export async function createAuctionBackoffice(req: Request, res: Response) {
  const result = createAuctionBackofficeSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const { url, firstBidPrice } = result.data

  let scraped
  try {
    scraped = await scrapeYahooAuction(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scraping failed'
    return res.status(422).json({ success: false, error: { code: 'SCRAPE_ERROR', message } })
  }

  const { auctionRequest, userCode } = await prisma.$transaction(async (tx) => {
    const userCode = await generateUserCode(tx as Pick<PrismaClient, 'user'>)
    const user = await tx.user.create({
      data: {
        userCode,
        externalId: null,
        username: null,
        email: null,
        password: null,
        name: null,
        phone: null,
        role: 'CUSTOMER',
        isEmailVerified: false,
        isActive: true,
      },
    })

    const auctionRequest = await tx.auctionRequest.create({
      data: {
        userId: user.id,
        url,
        web: 'yahoo',
        itemId: scraped.itemId,
        title: scraped.title,
        imageUrl: scraped.imageUrl,
        currentPrice: scraped.currentPrice,
        currentPriceBaht: jpyToBaht(scraped.currentPrice),
        endTime: scraped.endTime ? new Date(scraped.endTime) : null,
        status: 'pending',
      },
    })

    const stageTypes = await tx.deliveryStageType.findMany({ orderBy: { sortOrder: 'asc' } })
    await tx.deliveryStage.createMany({
      data: stageTypes.map((st) => ({
        auctionRequestId: auctionRequest.id,
        stageTypeId: st.id,
        status: 'PENDING',
      })),
    })

    if (firstBidPrice != null) {
      await tx.auctionPriceLog.create({
        data: {
          auctionRequestId: auctionRequest.id,
          price: firstBidPrice,
          bidCount: 1,
        },
      })
    }

    return { auctionRequest, userCode }
  })

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
    message: 'Auction request created',
  })
}

export async function updateAuctionNote(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = updateAuctionNoteSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const existing = await prisma.auctionRequest.findUnique({ where: { id } })
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  const updated = await prisma.auctionRequest.update({
    where: { id },
    data: { note: result.data.note },
    include: {
      deliveryStages: {
        include: { stageType: true },
        orderBy: { stageType: { sortOrder: 'asc' } },
      },
    },
  })

  const stages = updated.deliveryStages.map((s) => ({
    id: s.id,
    stageTypeCode: s.stageType.code,
    stageTypeNameTh: s.stageType.nameTh,
    status: s.status,
    trackingNumber: s.trackingNumber ?? null,
    carrier: s.carrier ?? null,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }))
  const isDeliveried = stages.length > 0 && stages.every((s) => s.status === 'DELIVERED')
  const { deliveryStages: _ds, ...rest } = updated

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
    message: 'Note updated',
  })
}

export async function updateAuctionStatus(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = updateAuctionStatusSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const existing = await prisma.auctionRequest.findUnique({ where: { id } })
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  const updated = await prisma.auctionRequest.update({
    where: { id },
    data: { status: result.data.status },
    include: {
      deliveryStages: {
        include: { stageType: true },
        orderBy: { stageType: { sortOrder: 'asc' } },
      },
    },
  })

  const stages = updated.deliveryStages.map((s) => ({
    id: s.id,
    stageTypeCode: s.stageType.code,
    stageTypeNameTh: s.stageType.nameTh,
    status: s.status,
    trackingNumber: s.trackingNumber ?? null,
    carrier: s.carrier ?? null,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }))
  const isDeliveried = stages.length > 0 && stages.every((s) => s.status === 'DELIVERED')
  const { deliveryStages: _ds, ...rest } = updated

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
  })
}
