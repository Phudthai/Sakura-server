/**
 * @file purchase-request.routes.ts
 * @description Backoffice purchase request routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as purchaseRequestController from '../../controllers/backoffice/purchase-request.controller'
import * as bidsController from '../../controllers/backoffice/bids.controller'

const router = Router()

router.get('/domestic-shipping-queue', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.listDomesticShippingQueue)
router.patch(
  '/domestic-shipping-queue/:userId',
  requireAuth(['ADMIN', 'STAFF']),
  purchaseRequestController.updateDomesticShipping,
)
router.get(
  '/domestic-shipping-queue/:userId/items',
  requireAuth(['ADMIN', 'STAFF']),
  purchaseRequestController.getDomesticShippingQueueItems,
)
router.get('/purchase-requests', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.listAuctionsBackoffice)
router.post('/purchase-requests', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.createAuctionBackoffice)
router.post('/purchase-requests/:id/bids', requireAuth(['ADMIN', 'STAFF']), bidsController.submitBidBackoffice)
router.patch('/purchase-requests/:id/note', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.updateAuctionNote)
router.patch('/purchase-requests/:id/lot', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.assignLotToAuction)
router.patch('/purchase-requests/:id/weight-gram', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.updateAuctionWeightGram)
router.patch('/purchase-requests/:id', requireAuth(['ADMIN', 'STAFF']), purchaseRequestController.updateAuctionStatus)

export default router
