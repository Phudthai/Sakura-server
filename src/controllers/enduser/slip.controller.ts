/**
 * @file slip.controller.ts
 * @description Enduser slip submission — bulk payment (month+transportType); Staff enters amount and approves
 */

import { Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../../../packages/database/src'
import { parseMonthParam } from '../../../packages/shared/src'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'slips')

function mapTransportType(t: string): string | null {
  const s = (t || '').toLowerCase()
  if (s === 'ship' || s === 'sea') return 'sea'
  if (s === 'airplane' || s === 'air') return 'air'
  return null
}

export async function submitSlip(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const parsed = parseMonthParam(req.query.month as string, req.query.year as string)
  if (!parsed) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MONTH', message: 'Valid month (1-12) or year-month (e.g. 2026-3) required' } })
  }
  const { month, year } = parsed
  const transportTypeRaw = req.query.transportType as string
  const transportType = mapTransportType(transportTypeRaw)

  if (!transportType) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSPORT_TYPE', message: 'transportType must be "ship" or "airplane"' } })
  }

  const file = req.file
  if (!file) {
    return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded. Use multipart/form-data with field "slip".' } })
  }

  const existingPending = await prisma.paymentReceipt.findFirst({
    where: {
      userId,
      month,
      transportType,
      status: 'PENDING_VERIFICATION',
      OR: [{ year }, { year: null }],
    },
  })
  if (existingPending) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(400).json({ success: false, error: { code: 'PENDING_EXISTS', message: 'Slip already submitted for this month/transport and awaiting verification' } })
  }

  const slipImageUrl = `/uploads/slips/${file.filename}`
  const receipt = await prisma.paymentReceipt.create({
    data: {
      userId,
      month,
      year,
      transportType,
      slipImageUrl,
      status: 'PENDING_VERIFICATION',
    },
  })

  return res.status(201).json({
    success: true,
    data: {
      receiptId: receipt.id,
      slipImageUrl,
      status: receipt.status,
      month,
      year,
      transportType,
    },
    message: 'Slip submitted successfully. Awaiting staff verification.',
  })
}

export async function getSlipStatus(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const parsed = parseMonthParam(req.query.month as string, req.query.year as string)
  if (!parsed) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MONTH', message: 'Valid month (1-12) or year-month (e.g. 2026-3) required' } })
  }
  const { month, year } = parsed
  const transportTypeRaw = req.query.transportType as string
  const transportType = mapTransportType(transportTypeRaw)

  if (!transportType) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSPORT_TYPE', message: 'transportType must be "ship" or "airplane"' } })
  }

  const receipt = await prisma.paymentReceipt.findFirst({
    where: {
      userId,
      month,
      transportType,
      OR: [{ year }, { year: null }],
    },
    orderBy: { createdAt: 'desc' },
    include: { transactions: true },
  })

  if (!receipt) {
    return res.json({
      success: true,
      data: {
        month,
        year,
        transportType,
        slipStatus: null,
        message: 'No slip submitted yet',
      },
    })
  }

  const totalAllocated = receipt.transactions.reduce((s, t) => s + t.amount, 0)

  return res.json({
    success: true,
    data: {
      month,
      year,
      transportType,
      slipStatus: {
        receiptId: receipt.id,
        status: receipt.status,
        slipImageUrl: receipt.slipImageUrl,
        amount: receipt.amount,
        paidAt: receipt.paidAt?.toISOString() ?? null,
        rejectionReason: receipt.rejectionReason ?? null,
        totalAllocated,
      },
    },
  })
}
