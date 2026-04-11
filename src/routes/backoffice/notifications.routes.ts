/**
 * @file notifications.routes.ts
 * @description Backoffice notification summary for UI polling
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as notificationsController from '../../controllers/backoffice/notifications.controller'

const router = Router()

router.get('/summary', requireAuth(['ADMIN', 'STAFF']), notificationsController.getNotificationsSummary)

export default router
