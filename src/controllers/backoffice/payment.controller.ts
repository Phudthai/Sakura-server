/**
 * @file payment.controller.ts
 * @description Backoffice payment slip upload
 */

import { Request, Response } from 'express'
import * as fs from 'fs'
import { prisma } from '../../../packages/database/src'

export async function uploadSlip(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid obligation id' } })
  }

  const file = req.file
  if (!file) {
    return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded. Use multipart/form-data with field "slip".' } })
  }

  const obligation = await prisma.paymentObligation.findUnique({
    where: { id },
    include: { transactions: { orderBy: { paidAt: 'asc' }, take: 1 } },
  })
  if (!obligation) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment obligation not found' } })
  }

  const slipImageUrl = `/uploads/slips/${file.filename}`
  const slipReference = typeof req.body.slipReference === 'string' ? req.body.slipReference.trim() || null : null

  const existingTx = obligation.transactions[0]
  let transactionId: number
  let finalSlipReference = slipReference

  if (existingTx) {
    await prisma.paymentTransaction.update({
      where: { id: existingTx.id },
      data: {
        slipImageUrl,
        ...(slipReference != null && { slipReference }),
      },
    })
    transactionId = existingTx.id
    finalSlipReference = slipReference ?? existingTx.slipReference
  } else {
    const tx = await prisma.paymentTransaction.create({
      data: {
        paymentObligationId: id,
        amount: obligation.amount,
        paidAt: new Date(),
        slipImageUrl,
        slipReference,
      },
    })
    transactionId = tx.id
    finalSlipReference = slipReference ?? tx.slipReference
  }

  return res.json({
    success: true,
    data: {
      slipImageUrl,
      slipReference: finalSlipReference,
      obligationId: id,
      transactionId,
    },
    message: 'Slip uploaded successfully',
  })
}
