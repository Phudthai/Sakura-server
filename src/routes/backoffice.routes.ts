import { Router, Request, Response } from 'express'
import { prisma } from '../../packages/database/src'
import { approveBidSchema, rejectBidSchema, createStaffSchema, updateStaffSchema } from '../../packages/shared/src'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()

// ---------------------------------------------------------------------------
// GET /api/backoffice/pending-bids
// List all auction_price_logs with status = 'pending'
// ---------------------------------------------------------------------------
router.get('/pending-bids', requireAuth(['ADMIN', 'STAFF']), async (_req: Request, res: Response) => {
  const logs = await prisma.auctionPriceLog.findMany({
    where: { status: 'pending' },
    orderBy: { recordedAt: 'asc' },
    include: {
      auctionRequest: {
        select: {
          id: true,
          url: true,
          title: true,
          imageUrl: true,
          yahooItemId: true,
          currentPrice: true,
          endTime: true,
          note: true,
          user: { select: { userCode: true, externalId: true } },
        },
      },
      staff: { select: { id: true, name: true } },
    },
  })

  return res.json({
    success: true,
    data: logs.map((l) => ({
      id: l.id,
      auctionRequestId: l.auctionRequestId,
      price: l.price,
      bidCount: l.bidCount,
      status: l.status,
      staff: l.staff,
      recordedAt: l.recordedAt.toISOString(),
      auctionRequest: l.auctionRequest
        ? {
            id: l.auctionRequest.id,
            url: l.auctionRequest.url,
            title: l.auctionRequest.title,
            imageUrl: l.auctionRequest.imageUrl,
            yahooItemId: l.auctionRequest.yahooItemId,
            currentPrice: l.auctionRequest.currentPrice,
            endTime: l.auctionRequest.endTime?.toISOString() ?? null,
            note: l.auctionRequest.note,
            userCode: l.auctionRequest.user?.userCode ?? null,
            externalId: l.auctionRequest.user?.externalId ?? null,
          }
        : null,
    })),
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/backoffice/bids/:id/approve
// Approve a pending bid — set status = 'approved' + biddedBy
// ---------------------------------------------------------------------------
router.patch('/bids/:id/approve', requireAuth(['ADMIN', 'STAFF']), async (req: Request, res: Response) => {
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
    data: { status: 'approved', biddedBy: result.data.biddedBy },
  })

  return res.json({
    success: true,
    data: { ...updated, recordedAt: updated.recordedAt.toISOString() },
    message: `Bid #${id} approved — assigned to ${staff.name}`,
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/backoffice/bids/:id/reject
// Reject a pending bid — set status = 'rejected'
// ---------------------------------------------------------------------------
router.patch('/bids/:id/reject', requireAuth(['ADMIN', 'STAFF']), async (req: Request, res: Response) => {
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
    data: { ...updated, recordedAt: updated.recordedAt.toISOString(), rejectReason: result.data.reason },
    message: `Bid #${id} rejected`,
  })
})

// ---------------------------------------------------------------------------
// GET /api/backoffice/staffs
// List all staff members
// ---------------------------------------------------------------------------
router.get('/staffs', requireAuth(['ADMIN', 'STAFF']), async (_req: Request, res: Response) => {
  const staffs = await prisma.staff.findMany({
    orderBy: { name: 'asc' },
  })

  return res.json({
    success: true,
    data: staffs.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt.toISOString(),
    })),
  })
})

// ---------------------------------------------------------------------------
// POST /api/backoffice/staffs
// Create a new staff member
// ---------------------------------------------------------------------------
router.post('/staffs', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
  const result = createStaffSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const staff = await prisma.staff.create({
    data: { name: result.data.name },
  })

  return res.status(201).json({
    success: true,
    data: { id: staff.id, name: staff.name, createdAt: staff.createdAt.toISOString() },
    message: `Staff "${staff.name}" created`,
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/backoffice/staffs/:id
// Update a staff member
// ---------------------------------------------------------------------------
router.patch('/staffs/:id', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = updateStaffSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const existing = await prisma.staff.findUnique({ where: { id } })
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Staff not found' } })
  }

  const updated = await prisma.staff.update({
    where: { id },
    data: { name: result.data.name },
  })

  return res.json({
    success: true,
    data: { id: updated.id, name: updated.name, createdAt: updated.createdAt.toISOString() },
    message: `Staff updated`,
  })
})

export default router
