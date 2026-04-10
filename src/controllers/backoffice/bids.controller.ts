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

  const auctionRequest = await prisma.purchaseRequest.findUnique({ where: { id } })
  if (!auctionRequest) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Auction request not found' } })
  }

  if (auctionRequest.purchase_mode === 'BUYOUT') {
    return res.status(409).json({
      success: false,
      error: { code: 'NOT_AUCTION_MODE', message: 'Bidding is not available for buyout purchase requests' },
    })
  }

  if (auctionRequest.status === 'completed' || auctionRequest.status === 'cancelled') {
    return res.status(409).json({
      success: false,
      error: { code: 'AUCTION_ENDED', message: `Cannot bid on a ${auctionRequest.status} auction` },
    })
  }

  const actor = await prisma.user.findUnique({ where: { id: biddedBy } })
  if (!actor) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Actor user not found' } })
  }

  const bidCount = await prisma.auctionPriceLog.count({ where: { purchase_request_id: id } })

  const bid = await prisma.auctionPriceLog.create({
    data: {
      purchase_request_id: id,
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
      auctionRequestId: bid.purchase_request_id,
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
      purchase_request: {
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
      bidder: { select: { id: true, name: true, username: true } },
    },
  })

  return res.json({
    success: true,
    data: logs.map((l) => ({
      id: l.id,
      auctionRequestId: l.purchase_request_id,
      price: l.price,
      bidCount: l.bid_count,
      status: l.status,
      bidder: l.bidder,
      recordedAt: l.recorded_at.toISOString(),
      auctionRequest: l.purchase_request
        ? {
            id: l.purchase_request.id,
            url: l.purchase_request.url,
            title: l.purchase_request.title,
            imageUrl: l.purchase_request.image_url,
            web: l.purchase_request.web,
            itemId: l.purchase_request.item_id,
            currentPrice: l.purchase_request.current_price,
            endTime: l.purchase_request.end_time?.toISOString() ?? null,
            note: l.purchase_request.note,
            userCode: l.purchase_request.user?.user_code ?? null,
            username: l.purchase_request.user?.username ?? null,
            externalId: l.purchase_request.user?.external_id ?? null,
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

  const actor = await prisma.user.findUnique({ where: { id: result.data.biddedBy } })
  if (!actor) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Actor user not found' } })
  }

  const updated = await prisma.auctionPriceLog.update({
    where: { id },
    data: { status: 'approved', bidded_by: result.data.biddedBy },
  })

  return res.json({
    success: true,
    data: {
      id: updated.id,
      auctionRequestId: updated.purchase_request_id,
      price: updated.price,
      bidCount: updated.bid_count,
      status: updated.status,
      biddedBy: updated.bidded_by,
      recordedAt: updated.recorded_at.toISOString(),
    },
    message: `Bid #${id} approved — assigned to ${actor.name ?? actor.username ?? `#${actor.id}`}`,
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
      auctionRequestId: updated.purchase_request_id,
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
