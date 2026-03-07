import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.middleware'
import * as auctionController from '../controllers/auction.controller'

const router = Router()

// Mock endpoint — dev only (or ADMIN in production)
const mockGuard = process.env.NODE_ENV === 'production' ? requireAuth(['ADMIN']) : requireAuth()

router.post('/', optionalAuth, auctionController.createAuction)
router.get('/', requireAuth(), auctionController.listAuctions)
router.get('/:id/price-logs', requireAuth(), auctionController.getPriceLogs)
router.post('/:id/bids', requireAuth(), auctionController.submitBid)
router.post('/:id/mock', mockGuard, auctionController.mockAuction)
router.patch('/:id/note', requireAuth(['ADMIN', 'STAFF']), auctionController.updateNote)
router.patch('/:id', requireAuth(['ADMIN', 'STAFF']), auctionController.updateStatus)

export default router
