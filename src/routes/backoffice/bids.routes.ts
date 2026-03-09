/**
 * @file bids.routes.ts
 * @description Backoffice bid approval routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as bidsController from '../../controllers/backoffice/bids.controller'

const router = Router()

router.get('/pending-bids', requireAuth(['ADMIN', 'STAFF']), bidsController.getPendingBids)
router.patch('/bids/:id/approve', requireAuth(['ADMIN', 'STAFF']), bidsController.approveBid)
router.patch('/bids/:id/reject', requireAuth(['ADMIN', 'STAFF']), bidsController.rejectBid)

export default router
