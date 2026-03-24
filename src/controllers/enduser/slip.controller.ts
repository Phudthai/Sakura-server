/**
 * @file slip.controller.ts
 * @description Enduser slip — monthly intl | domestic (purpose=domestic) | wallet top-up (purpose=wallet)
 */

import { Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../../../packages/database/src'
import {
  parseMonthParam,
  PAYMENT_RECEIPT_PURPOSE_DOMESTIC,
  PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP,
} from '../../../packages/shared/src'

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

  const purposeRaw = (req.query.purpose as string | undefined)?.toLowerCase()
  const isDomestic = purposeRaw === 'domestic'

  const file = req.file
  if (!file) {
    return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded. Use multipart/form-data with field "slip".' } })
  }

  if (isDomestic) {
    const existingPending = await prisma.paymentReceipt.findFirst({
      where: {
        user_id: userId,
        purpose: PAYMENT_RECEIPT_PURPOSE_DOMESTIC,
        status: 'PENDING_VERIFICATION',
      },
    })
    if (existingPending) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
      return res.status(400).json({
        success: false,
        error: {
          code: 'PENDING_EXISTS',
          message: 'A domestic shipping slip is already awaiting verification',
        },
      })
    }

    const slipImageUrl = `/uploads/slips/${file.filename}`
    const receipt = await prisma.paymentReceipt.create({
      data: {
        user_id: userId,
        month: null,
        year: null,
        transport_type: null,
        purpose: PAYMENT_RECEIPT_PURPOSE_DOMESTIC,
        slip_image_url: slipImageUrl,
        status: 'PENDING_VERIFICATION',
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        receiptId: receipt.id,
        slipImageUrl,
        status: receipt.status,
        purpose: 'domestic',
      },
      message: 'Domestic shipping slip submitted. Awaiting staff verification.',
    })
  }

  const isWalletTopup =
    purposeRaw === 'wallet' || purposeRaw === 'wallet_topup' || purposeRaw === 'topup'
  if (isWalletTopup) {
    const existingPending = await prisma.paymentReceipt.findFirst({
      where: {
        user_id: userId,
        purpose: PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP,
        status: 'PENDING_VERIFICATION',
      },
    })
    if (existingPending) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
      return res.status(400).json({
        success: false,
        error: {
          code: 'PENDING_EXISTS',
          message: 'A wallet top-up slip is already awaiting verification',
        },
      })
    }

    const slipImageUrl = `/uploads/slips/${file.filename}`
    const receipt = await prisma.$transaction(async (tx) => {
      const rec = await tx.paymentReceipt.create({
        data: {
          user_id: userId,
          month: null,
          year: null,
          transport_type: null,
          purpose: PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP,
          slip_image_url: slipImageUrl,
          status: 'PENDING_VERIFICATION',
        },
      })
      const walletTopupType = await tx.paymentObligationType.findUnique({
        where: { code: 'WALLET_TOPUP' },
      })
      if (walletTopupType) {
        const existingPending = await tx.paymentObligation.findFirst({
          where: {
            user_id: userId,
            obligation_type_id: walletTopupType.id,
            status: 'PENDING',
          },
          orderBy: { id: 'asc' },
        })
        if (!existingPending) {
          await tx.paymentObligation.create({
            data: {
              user_id: userId,
              auction_request_id: null,
              obligation_type_id: walletTopupType.id,
              amount: 0,
              currency: 'THB',
              status: 'PENDING',
            },
          })
        }
      }
      return rec
    })

    return res.status(201).json({
      success: true,
      data: {
        receiptId: receipt.id,
        slipImageUrl,
        status: receipt.status,
        purpose: 'wallet_topup',
      },
      message: 'Wallet top-up slip submitted. Awaiting staff verification.',
    })
  }

  const parsed = parseMonthParam(req.query.month as string, req.query.year as string)
  if (!parsed) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_MONTH', message: 'Valid month (1-12) or year-month (e.g. 2026-3) required for monthly slip' },
    })
  }
  const { month, year } = parsed
  const transportTypeRaw = req.query.transportType as string
  const transportType = mapTransportType(transportTypeRaw)

  if (!transportType) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSPORT_TYPE', message: 'transportType must be "ship" or "airplane"' } })
  }

  const existingPending = await prisma.paymentReceipt.findFirst({
    where: {
      user_id: userId,
      month,
      transport_type: transportType,
      status: 'PENDING_VERIFICATION',
      OR: [{ year }, { year: null }],
      purpose: null,
    },
  })
  if (existingPending) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(400).json({ success: false, error: { code: 'PENDING_EXISTS', message: 'Slip already submitted for this month/transport and awaiting verification' } })
  }

  const slipImageUrl = `/uploads/slips/${file.filename}`
  const receipt = await prisma.paymentReceipt.create({
    data: {
      user_id: userId,
      month,
      year,
      transport_type: transportType,
      purpose: null,
      slip_image_url: slipImageUrl,
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
      purpose: 'monthly',
    },
    message: 'Slip submitted successfully. Awaiting staff verification.',
  })
}

export async function getSlipStatus(req: Request, res: Response) {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
  }

  const purposeRaw = (req.query.purpose as string | undefined)?.toLowerCase()
  const isDomestic = purposeRaw === 'domestic'
  const isWalletTopup =
    purposeRaw === 'wallet' || purposeRaw === 'wallet_topup' || purposeRaw === 'topup'

  if (isDomestic) {
    const receipt = await prisma.paymentReceipt.findFirst({
      where: {
        user_id: userId,
        purpose: PAYMENT_RECEIPT_PURPOSE_DOMESTIC,
      },
      orderBy: { created_at: 'desc' },
      include: { transactions: true },
    })

    if (!receipt) {
      return res.json({
        success: true,
        data: {
          purpose: 'domestic',
          slipStatus: null,
          message: 'No domestic slip submitted yet',
        },
      })
    }

    const totalAllocated = receipt.transactions.reduce((s, t) => s + t.amount, 0)

    return res.json({
      success: true,
      data: {
        purpose: 'domestic',
        slipStatus: {
          receiptId: receipt.id,
          status: receipt.status,
          slipImageUrl: receipt.slip_image_url,
          amount: receipt.amount,
          paidAt: receipt.paid_at?.toISOString() ?? null,
          rejectionReason: receipt.rejection_reason ?? null,
          totalAllocated,
        },
      },
    })
  }

  if (isWalletTopup) {
    const receipt = await prisma.paymentReceipt.findFirst({
      where: {
        user_id: userId,
        purpose: PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP,
      },
      orderBy: { created_at: 'desc' },
      include: { transactions: true },
    })

    if (!receipt) {
      return res.json({
        success: true,
        data: {
          purpose: 'wallet_topup',
          slipStatus: null,
          message: 'No wallet top-up slip submitted yet',
        },
      })
    }

    const totalAllocated = receipt.transactions.reduce((s, t) => s + t.amount, 0)

    return res.json({
      success: true,
      data: {
        purpose: 'wallet_topup',
        slipStatus: {
          receiptId: receipt.id,
          status: receipt.status,
          slipImageUrl: receipt.slip_image_url,
          amount: receipt.amount,
          paidAt: receipt.paid_at?.toISOString() ?? null,
          rejectionReason: receipt.rejection_reason ?? null,
          totalAllocated,
        },
      },
    })
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
      user_id: userId,
      month,
      transport_type: transportType,
      OR: [{ year }, { year: null }],
      purpose: null,
    },
    orderBy: { created_at: 'desc' },
    include: { transactions: true },
  })

  if (!receipt) {
    return res.json({
      success: true,
      data: {
        month,
        year,
        transportType,
        purpose: 'monthly',
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
      purpose: 'monthly',
      slipStatus: {
        receiptId: receipt.id,
        status: receipt.status,
        slipImageUrl: receipt.slip_image_url,
        amount: receipt.amount,
        paidAt: receipt.paid_at?.toISOString() ?? null,
        rejectionReason: receipt.rejection_reason ?? null,
        totalAllocated,
      },
    },
  })
}
