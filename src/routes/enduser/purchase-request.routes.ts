/**
 * @file purchase-request.routes.ts
 * @description Enduser purchase request routes
 */

import { Router } from 'express'
import { optionalAuth, requireAuth } from '../../middleware/auth.middleware'
import * as purchaseRequestController from '../../controllers/enduser/purchase-request.controller'

const router = Router()

const mockGuard = process.env.NODE_ENV === 'production' ? requireAuth(['ADMIN']) : requireAuth()

router.post('/', optionalAuth, purchaseRequestController.createAuction)
router.get('/', requireAuth(), purchaseRequestController.listAuctions)
router.get('/:id/price-logs', requireAuth(), purchaseRequestController.getPriceLogs)
router.post('/:id/bids', requireAuth(), purchaseRequestController.submitBid)
router.post('/:id/mock', mockGuard, purchaseRequestController.mockAuction)

export default router
