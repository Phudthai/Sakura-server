import { Request, Response } from 'express'
import { prisma } from '../../packages/database/src'
import { createAuctionRequestSchema, updateAuctionStatusSchema, updateAuctionNoteSchema, submitBidSchema, mockAuctionSchema } from '../../packages/shared/src'
import { scrapeYahooAuction } from '../services/auction-scraper.service'

export async function createAuction(req: Request, res: Response) {
  const result = createAuctionRequestSchema.safeParse(req.body)
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

  const auctionRequest = await prisma.auctionRequest.create({
    data: {
      userId: req.user?.userId ?? null,
      url,
      yahooItemId: scraped.itemId,
      title: scraped.title,
      imageUrl: scraped.imageUrl,
      currentPrice: scraped.currentPrice,
      endTime: scraped.endTime ? new Date(scraped.endTime) : null,
      status: 'pending',
    },
  })

  if (firstBidPrice != null) {
    await prisma.auctionPriceLog.create({
      data: {
        auctionRequestId: auctionRequest.id,
        price: firstBidPrice,
        bidCount: 1,
      },
    })
  }

  return res.status(201).json({
    success: true,
    data: {
      id: auctionRequest.id,
      title: scraped.title,
      currentPrice: auctionRequest.currentPrice,
      endTime: scraped.endTime,
      imageUrl: scraped.imageUrl,
      yahooItemId: scraped.itemId,
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
    ...(!isAdmin ? { userId: req.user!.userId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.auctionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        priceLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
    }),
    prisma.auctionRequest.count({ where }),
  ])

  return res.json({
    success: true,
    data: data.map((r) => {
      const lastBid = r.priceLogs[0]
      const { priceLogs, ...rest } = r
      return {
        ...rest,
        bidResult: r.bidResult ?? null,
        lastBid: lastBid ? { price: lastBid.price, status: lastBid.status } : null,
        endTime: r.endTime?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
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
  if (!isAdmin && auctionRequest.userId !== req.user!.userId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
  }

  const logs = await prisma.auctionPriceLog.findMany({
    where: { auctionRequestId: id },
    orderBy: { recordedAt: 'asc' },
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
          auctionRequestId: l.auctionRequestId,
          price: l.price,
          bidCount: l.bidCount,
          status: l.status,
          statusLabel: s.label,
          statusColor: s.color,
          recordedAt: l.recordedAt.toISOString(),
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
  if (!isAdmin && auctionRequest.userId !== req.user!.userId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
  }

  if (auctionRequest.status === 'completed' || auctionRequest.status === 'cancelled') {
    return res.status(409).json({ success: false, error: { code: 'AUCTION_ENDED', message: `Cannot bid on a ${auctionRequest.status} auction` } })
  }

  const bidCount = await prisma.auctionPriceLog.count({ where: { auctionRequestId: id } })

  const bid = await prisma.auctionPriceLog.create({
    data: {
      auctionRequestId: id,
      price: result.data.price,
      bidCount: bidCount + 1,
      status: 'pending',
    },
  })

  return res.status(201).json({
    success: true,
    data: {
      id: bid.id,
      auctionRequestId: bid.auctionRequestId,
      price: bid.price,
      bidCount: bid.bidCount,
      status: bid.status,
      recordedAt: bid.recordedAt.toISOString(),
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
      where: { auctionRequestId: id },
      orderBy: { recordedAt: 'desc' },
    })
    const basePrice = Math.max(auctionRequest.currentPrice ?? 0, lastBid?.price ?? 0)
    const newPrice = basePrice + 500

    await prisma.auctionRequest.update({
      where: { id },
      data: { currentPrice: newPrice },
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
      data: { endTime },
    })

    return res.json({
      success: true,
      data: { action: 'end-time', endTime: endTime.toISOString() },
      message: 'Mock end-time: auction ends in 60 seconds',
    })
  }
}

export async function updateNote(req: Request, res: Response) {
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
  })

  return res.json({
    success: true,
    data: {
      ...updated,
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: 'Note updated',
  })
}

export async function updateStatus(req: Request, res: Response) {
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
  })

  return res.json({
    success: true,
    data: {
      ...updated,
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: `Status updated to ${result.data.status}`,
  })
}
