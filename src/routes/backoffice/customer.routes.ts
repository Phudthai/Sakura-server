/**
 * @file customer.routes.ts
 * @description Backoffice customer management routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as customerController from '../../controllers/backoffice/customer.controller'

const router = Router()

router.get('/customers', requireAuth(['ADMIN', 'STAFF']), customerController.listCustomers)

export default router
