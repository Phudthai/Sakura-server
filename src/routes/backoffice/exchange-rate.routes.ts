/**
 * @file exchange-rate.routes.ts
 * @description Backoffice exchange rate (JPY→THB tiers)
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as exchangeRateController from '../../controllers/backoffice/exchange-rate.controller'
import * as shippingGramRateController from '../../controllers/backoffice/shipping-gram-rate.controller'

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

router.get(
  '/shipping-gram-rates',
  requireAuth(['ADMIN', 'STAFF']),
  shippingGramRateController.getShippingGramRates,
)
router.put(
  '/shipping-gram-rates',
  requireAuth(['ADMIN', 'STAFF']),
  shippingGramRateController.putShippingGramRates,
)

export default router
