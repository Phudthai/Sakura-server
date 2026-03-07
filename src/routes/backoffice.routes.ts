import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import * as backofficeController from '../controllers/backoffice.controller'

const router = Router()

router.get('/pending-bids', requireAuth(['ADMIN', 'STAFF']), backofficeController.getPendingBids)
router.patch('/bids/:id/approve', requireAuth(['ADMIN', 'STAFF']), backofficeController.approveBid)
router.patch('/bids/:id/reject', requireAuth(['ADMIN', 'STAFF']), backofficeController.rejectBid)
router.get('/staffs', requireAuth(['ADMIN', 'STAFF']), backofficeController.listStaffs)
router.post('/staffs', requireAuth(['ADMIN']), backofficeController.createStaff)
router.patch('/staffs/:id', requireAuth(['ADMIN']), backofficeController.updateStaff)

export default router
