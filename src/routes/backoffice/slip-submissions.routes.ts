/**
 * @file slip-submissions.routes.ts
 * @description Backoffice slip verification routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as paymentController from '../../controllers/backoffice/payment.controller'

const router = Router()

router.get('/pending', requireAuth(['ADMIN', 'STAFF']), paymentController.listPendingSlips)
router.post('/:receiptId/approve', requireAuth(['ADMIN', 'STAFF']), paymentController.approveSlip)
router.post('/:receiptId/reject', requireAuth(['ADMIN', 'STAFF']), paymentController.rejectSlip)

export default router
