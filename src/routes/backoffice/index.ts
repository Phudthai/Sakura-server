/**
 * @file index.ts
 * @description Backoffice routes — combines all backoffice route modules
 * Mount at /api/backoffice
 */

import { Router } from 'express'
import { API_BASE_PATH } from '../../config'
import { requireAuth } from '../../middleware/auth.middleware'
import * as walletController from '../../controllers/backoffice/wallet.controller'
import authRoutes from './auth.routes'
import auctionRoutes from './auction.routes'
import bidsRoutes from './bids.routes'
import lotRoutes from './lot.routes'
import overviewRoutes from './overview.routes'
import staffRoutes from './staff.routes'
import customerRoutes from './customer.routes'
import paymentRoutes from './payment.routes'
import slipSubmissionsRoutes from './slip-submissions.routes'
import walletRoutes from './wallet.routes'
import exchangeRateRoutes from './exchange-rate.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use(auctionRoutes)
router.use(bidsRoutes)
router.use(lotRoutes)
router.use(overviewRoutes)
router.use(staffRoutes)
router.use(customerRoutes)
router.use('/payment-obligations', paymentRoutes)
router.use('/slip-submissions', slipSubmissionsRoutes)
router.use('/wallet', walletRoutes)
router.use(exchangeRateRoutes)
router.get('/users/:id/wallet', requireAuth(['ADMIN', 'STAFF']), walletController.getUserWallet)

export const path = `${API_BASE_PATH}/backoffice`
export { router }
