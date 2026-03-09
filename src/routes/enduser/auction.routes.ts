/**
 * @file auction.routes.ts
 * @description Enduser auction request routes
 */

import { Router } from 'express'
import { optionalAuth, requireAuth } from '../../middleware/auth.middleware'
import * as auctionController from '../../controllers/enduser/auction.controller'

const router = Router()

const mockGuard = process.env.NODE_ENV === 'production' ? requireAuth(['ADMIN']) : requireAuth()

router.post('/', optionalAuth, auctionController.createAuction)
router.get('/', requireAuth(), auctionController.listAuctions)
router.get('/:id/price-logs', requireAuth(), auctionController.getPriceLogs)
router.post('/:id/bids', requireAuth(), auctionController.submitBid)
router.post('/:id/mock', mockGuard, auctionController.mockAuction)

export default router
