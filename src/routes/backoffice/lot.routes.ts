/**
 * @file lot.routes.ts
 * @description Backoffice lot routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as lotController from '../../controllers/backoffice/lot.controller'

const router = Router()

router.get(
  '/lots/grouped-by-shipping-type',
  requireAuth(['ADMIN', 'STAFF']),
  lotController.listLotsGroupedByShippingType,
)
router.get('/lots', requireAuth(['ADMIN', 'STAFF']), lotController.listLots)
router.post('/lots', requireAuth(['ADMIN', 'STAFF']), lotController.createLot)
router.patch('/lots/:id', requireAuth(['ADMIN', 'STAFF']), lotController.updateLot)

export default router
