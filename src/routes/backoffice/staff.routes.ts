/**
 * @file staff.routes.ts
 * @description Backoffice staff management routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as staffController from '../../controllers/backoffice/staff.controller'

const router = Router()

router.get('/staffs', requireAuth(['ADMIN', 'STAFF']), staffController.listStaffs)
router.post('/staffs', requireAuth(['ADMIN']), staffController.createStaff)
router.patch('/staffs/:id', requireAuth(['ADMIN']), staffController.updateStaff)

export default router
