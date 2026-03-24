/**
 * @file auction.controller.ts
 * @description Enduser auction request operations
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import { jpyToBaht } from '../../services/exchange-rate.service'
import {
  createAuctionRequestSchema,
  submitBidSchema,
  mockAuctionSchema,
} from '../../../packages/shared/src'
import { scrapeYahooAuction } from '../../services/auction-scraper.service'

export async function createAuction(req: Request, res: Response) {
  const result = createAuctionRequestSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const { url, firstBidPrice, intl_shipping_type } = result.data

  let scraped
  try {
    scraped = await scrapeYahooAuction(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scraping failed'
    return res.status(422).json({ success: false, error: { code: 'SCRAPE_ERROR', message } })
  }

  const auctionRequest = await prisma.auctionRequest.create({
    data: {
      user_id: req.user?.userId ?? null,
      url,
      web: 'yahoo',
      item_id: scraped.itemId,
      title: scraped.title,
      image_url: scraped.imageUrl,
      current_price: scraped.currentPrice,
      current_price_baht: jpyToBaht(scraped.currentPrice),
      end_time: scraped.endTime ? new Date(scraped.endTime) : null,
      status: 'pending',
      intl_shipping_type: intl_shipping_type,
    },
  })

  const stageTypes = await prisma.deliveryStageType.findMany({ orderBy: { sort_order: 'asc' } })
  await prisma.deliveryStage.createMany({
    data: stageTypes.map((st) => ({
      auction_request_id: auctionRequest.id,
      stage_type_id: st.id,
      status: 'PENDING',
    })),
  })

  if (firstBidPrice != null) {
    await prisma.auctionPriceLog.create({
      data: {
        auction_request_id: auctionRequest.id,
        price: firstBidPrice,
        bid_count: 1,
      },
    })
  }

  return res.status(201).json({
    success: true,
    data: {
      id: auctionRequest.id,
      title: scraped.title,
      currentPrice: auctionRequest.current_price,
      endTime: scraped.endTime,
      imageUrl: scraped.imageUrl,
      itemId: scraped.itemId,
      status: auctionRequest.status,
      partial: scraped.partial ?? false,
    },
  })
}

export async function listAuctions(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const status = req.query.status as string | undefined

  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'STAFF'
  const where = {
    ...(status ? { status } : {}),
    ...(!isAdmin ? { user_id: req.user!.userId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.auctionRequest.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: {
        price_logs: { orderBy: { recorded_at: 'desc' }, take: 1 },
        delivery_stages: {
          include: { stage_type: true },
          orderBy: { stage_type: { sort_order: 'asc' } },
        },
      },
    }),
    prisma.auctionRequest.count({ where }),
  ])

  return res.json({
    success: true,
    data: data.map((r) => {
      const lastBid = r.price_logs[0]
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
      }))
      const isDeliveried = stages.length > 0 && stages.every((s) => s.status === 'DELIVERED')
      return {
        id: r.id,
        userId: r.user_id,
        url: r.url,
        web: r.web,
        itemId: r.item_id,
        title: r.title,
        imageUrl: r.image_url,
        status: r.status,
        currentPrice: r.current_price,
        currentPriceBaht: r.current_price_baht,
        note: r.note,
        bidResult: r.bid_result ?? null,
        weightGram: r.weight_gram,
        intlShippingType: r.intl_shipping_type,
        lotId: r.lot_id,
        boughtAt: r.bought_at?.toISOString() ?? null,
        endTime: r.end_time?.toISOString() ?? null,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        lastBid: lastBid ? { price: lastBid.price, status: lastBid.status } : null,
        deliveryStages: stages,
        isDeliveried,
        shippingPrice: null,
      }
    }),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  })
}

export async function getPriceLogs(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const auctionRequest = await prisma.auctionRequest.findUnique({ where: { id } })
  if (!auctionRequest) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'STAFF'
  if (!isAdmin && auctionRequest.user_id !== req.user!.userId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
  }

  const logs = await prisma.auctionPriceLog.findMany({
    where: { auction_request_id: id },
    orderBy: { recorded_at: 'asc' },
  })

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: 'รอดำเนินการ', color: '#EAB308' },
    approved: { label: 'ดำเนินการแล้ว', color: '#22C55E' },
    rejected: { label: 'ปฏิเสธแล้ว', color: '#EF4444' },
  }

  return res.json({
    success: true,
    data: {
      logs: logs.map((l) => {
        const s = statusMap[l.status] ?? { label: l.status, color: '#6B7280' }
        return {
          id: l.id,
          auctionRequestId: l.auction_request_id,
          price: l.price,
          bidCount: l.bid_count,
          status: l.status,
          statusLabel: s.label,
          statusColor: s.color,
          recordedAt: l.recorded_at.toISOString(),
        }
      }),
    },
  })
}

export async function submitBid(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = submitBidSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const auctionRequest = await prisma.auctionRequest.findUnique({ where: { id } })
  if (!auctionRequest) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'STAFF'
  if (!isAdmin && auctionRequest.user_id !== req.user!.userId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
  }

  if (auctionRequest.status === 'completed' || auctionRequest.status === 'cancelled') {
    return res.status(409).json({
      success: false,
      error: { code: 'AUCTION_ENDED', message: `Cannot bid on a ${auctionRequest.status} auction` },
    })
  }

  const bidCount = await prisma.auctionPriceLog.count({ where: { auction_request_id: id } })

  const bid = await prisma.auctionPriceLog.create({
    data: {
      auction_request_id: id,
      price: result.data.price,
      bid_count: bidCount + 1,
      status: 'pending',
    },
  })

  return res.status(201).json({
    success: true,
    data: {
      id: bid.id,
      auctionRequestId: bid.auction_request_id,
      price: bid.price,
      bidCount: bid.bid_count,
      status: bid.status,
      recordedAt: bid.recorded_at.toISOString(),
    },
    message: 'Bid submitted successfully',
  })
}

export async function mockAuction(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = mockAuctionSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const auctionRequest = await prisma.auctionRequest.findUnique({ where: { id } })
  if (!auctionRequest) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  if (result.data.action === 'outbid') {
    const lastBid = await prisma.auctionPriceLog.findFirst({
      where: { auction_request_id: id },
      orderBy: { recorded_at: 'desc' },
    })
    const basePrice = Math.max(auctionRequest.current_price ?? 0, lastBid?.price ?? 0)
    const newPrice = basePrice + 500

    await prisma.auctionRequest.update({
      where: { id },
      data: {
        current_price: newPrice,
        current_price_baht: jpyToBaht(newPrice),
      },
    })

    return res.json({
      success: true,
      data: { action: 'outbid', newPrice },
      message: `Mock outbid: price raised to ${newPrice}`,
    })
  }

  if (result.data.action === 'end-time') {
    const endTime = new Date(Date.now() + 60 * 1000)

    await prisma.auctionRequest.update({
      where: { id },
      data: { end_time: endTime },
    })

    return res.json({
      success: true,
      data: { action: 'end-time', endTime: endTime.toISOString() },
      message: 'Mock end-time: auction ends in 60 seconds',
    })
  }
}
