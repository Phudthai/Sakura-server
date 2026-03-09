/**
 * @file auth.routes.ts
 * @description Backoffice auth routes — ADMIN/STAFF only
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as authController from '../../controllers/backoffice/auth.controller'

const router = Router()

router.post('/login', authController.loginBackoffice)
router.get('/me', requireAuth(['ADMIN', 'STAFF']), authController.meBackoffice)

export default router
