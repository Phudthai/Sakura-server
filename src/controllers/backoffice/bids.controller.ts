/**
 * @file bids.controller.ts
 * @description Backoffice bid approval operations
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import { approveBidSchema, rejectBidSchema, submitBidBackofficeSchema } from '../../../packages/shared/src'

export async function submitBidBackoffice(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = submitBidBackofficeSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const { price, biddedBy } = result.data

  const auctionRequest = await prisma.auctionRequest.findUnique({ where: { id } })
  if (!auctionRequest) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  if (auctionRequest.status === 'completed' || auctionRequest.status === 'cancelled') {
    return res.status(409).json({
      success: false,
      error: { code: 'AUCTION_ENDED', message: `Cannot bid on a ${auctionRequest.status} auction` },
    })
  }

  const staff = await prisma.staff.findUnique({ where: { id: biddedBy } })
  if (!staff) {
    return res.status(404).json({ success: false, error: { code: 'STAFF_NOT_FOUND', message: 'Staff not found' } })
  }

  const bidCount = await prisma.auctionPriceLog.count({ where: { auction_request_id: id } })

  const bid = await prisma.auctionPriceLog.create({
    data: {
      auction_request_id: id,
      price,
      bid_count: bidCount + 1,
      status: 'approved',
      bidded_by: biddedBy,
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
      biddedBy: bid.bidded_by,
      recordedAt: bid.recorded_at.toISOString(),
    },
    message: 'Bid submitted successfully',
  })
}

export async function getPendingBids(_req: Request, res: Response) {
  const logs = await prisma.auctionPriceLog.findMany({
    where: { status: 'pending' },
    orderBy: { recorded_at: 'asc' },
    include: {
      auction_request: {
        select: {
          id: true,
          url: true,
          title: true,
          image_url: true,
          web: true,
          item_id: true,
          current_price: true,
          end_time: true,
          note: true,
          user: { select: { user_code: true, username: true, external_id: true } },
        },
      },
      staff: { select: { id: true, name: true } },
    },
  })

  return res.json({
    success: true,
    data: logs.map((l) => ({
      id: l.id,
      auctionRequestId: l.auction_request_id,
      price: l.price,
      bidCount: l.bid_count,
      status: l.status,
      staff: l.staff,
      recordedAt: l.recorded_at.toISOString(),
      auctionRequest: l.auction_request
        ? {
            id: l.auction_request.id,
            url: l.auction_request.url,
            title: l.auction_request.title,
            imageUrl: l.auction_request.image_url,
            web: l.auction_request.web,
            itemId: l.auction_request.item_id,
            currentPrice: l.auction_request.current_price,
            endTime: l.auction_request.end_time?.toISOString() ?? null,
            note: l.auction_request.note,
            userCode: l.auction_request.user?.user_code ?? null,
            username: l.auction_request.user?.username ?? null,
            externalId: l.auction_request.user?.external_id ?? null,
          }
        : null,
    })),
  })
}

export async function approveBid(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = approveBidSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const log = await prisma.auctionPriceLog.findUnique({ where: { id } })
  if (!log) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bid not found' } })
  }
  if (log.status !== 'pending') {
    return res.status(409).json({ success: false, error: { code: 'ALREADY_PROCESSED', message: `Bid already ${log.status}` } })
  }

  const staff = await prisma.staff.findUnique({ where: { id: result.data.biddedBy } })
  if (!staff) {
    return res.status(404).json({ success: false, error: { code: 'STAFF_NOT_FOUND', message: 'Staff not found' } })
  }

  const updated = await prisma.auctionPriceLog.update({
    where: { id },
    data: { status: 'approved', bidded_by: result.data.biddedBy },
  })

  return res.json({
    success: true,
    data: {
      id: updated.id,
      auctionRequestId: updated.auction_request_id,
      price: updated.price,
      bidCount: updated.bid_count,
      status: updated.status,
      biddedBy: updated.bidded_by,
      recordedAt: updated.recorded_at.toISOString(),
    },
    message: `Bid #${id} approved — assigned to ${staff.name}`,
  })
}

export async function rejectBid(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = rejectBidSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const log = await prisma.auctionPriceLog.findUnique({ where: { id } })
  if (!log) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bid not found' } })
  }
  if (log.status !== 'pending') {
    return res.status(409).json({ success: false, error: { code: 'ALREADY_PROCESSED', message: `Bid already ${log.status}` } })
  }

  const updated = await prisma.auctionPriceLog.update({
    where: { id },
    data: { status: 'rejected' },
  })

  return res.json({
    success: true,
    data: {
      id: updated.id,
      auctionRequestId: updated.auction_request_id,
      price: updated.price,
      bidCount: updated.bid_count,
      status: updated.status,
      biddedBy: updated.bidded_by,
      recordedAt: updated.recorded_at.toISOString(),
      rejectReason: result.data.reason,
    },
    message: `Bid #${id} rejected`,
  })
}
