/**
 * @file exchange-rate.routes.ts
 * @description Backoffice exchange rate (JPY→THB tiers)
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as exchangeRateController from '../../controllers/backoffice/exchange-rate.controller'

const router = Router()

router.get(
  '/exchange-rates/jpy-thb',
  requireAuth(['ADMIN', 'STAFF']),
  exchangeRateController.getJpyThbTiers,
)
router.put(
  '/exchange-rates/jpy-thb',
  requireAuth(['ADMIN', 'STAFF']),
  exchangeRateController.putJpyThbTiers,
)

export default router
