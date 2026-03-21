/**
 * @file auction.routes.ts
 * @description Backoffice auction request routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as auctionController from '../../controllers/backoffice/auction.controller'
import * as bidsController from '../../controllers/backoffice/bids.controller'

const router = Router()

router.get('/domestic-shipping-queue', requireAuth(['ADMIN', 'STAFF']), auctionController.listDomesticShippingQueue)
router.get(
  '/domestic-shipping-queue/:userId/items',
  requireAuth(['ADMIN', 'STAFF']),
  auctionController.getDomesticShippingQueueItems,
)
router.get('/auction-requests', requireAuth(['ADMIN', 'STAFF']), auctionController.listAuctionsBackoffice)
router.post('/auction-requests', requireAuth(['ADMIN', 'STAFF']), auctionController.createAuctionBackoffice)
router.post('/auction-requests/:id/bids', requireAuth(['ADMIN', 'STAFF']), bidsController.submitBidBackoffice)
router.patch('/auction-requests/:id/note', requireAuth(['ADMIN', 'STAFF']), auctionController.updateAuctionNote)
router.patch('/auction-requests/:id/lot', requireAuth(['ADMIN', 'STAFF']), auctionController.assignLotToAuction)
router.patch('/auction-requests/:id/weight-gram', requireAuth(['ADMIN', 'STAFF']), auctionController.updateAuctionWeightGram)
router.patch('/auction-requests/:id/domestic-shipping', requireAuth(['ADMIN', 'STAFF']), auctionController.updateDomesticShipping)
router.patch('/auction-requests/:id', requireAuth(['ADMIN', 'STAFF']), auctionController.updateAuctionStatus)

export default router
