/**
 * @file auction.routes.ts
 * @description Backoffice auction request routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as auctionController from '../../controllers/backoffice/auction.controller'

const router = Router()

router.get('/auction-requests', requireAuth(['ADMIN', 'STAFF']), auctionController.listAuctionsBackoffice)
router.post('/auction-requests', requireAuth(['ADMIN', 'STAFF']), auctionController.createAuctionBackoffice)
router.patch('/auction-requests/:id/note', requireAuth(['ADMIN', 'STAFF']), auctionController.updateAuctionNote)
router.patch('/auction-requests/:id', requireAuth(['ADMIN', 'STAFF']), auctionController.updateAuctionStatus)

export default router
