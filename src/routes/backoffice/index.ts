/**
 * @file index.ts
 * @description Backoffice routes — combines all backoffice route modules
 * Mount at /api/backoffice
 */

import { Router } from 'express'
import { API_BASE_PATH } from '../../config'
import authRoutes from './auth.routes'
import auctionRoutes from './auction.routes'
import bidsRoutes from './bids.routes'
import staffRoutes from './staff.routes'
import customerRoutes from './customer.routes'
import paymentRoutes from './payment.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use(auctionRoutes)
router.use(bidsRoutes)
router.use(staffRoutes)
router.use(customerRoutes)
router.use('/payment-obligations', paymentRoutes)

export const path = `${API_BASE_PATH}/backoffice`
export { router }
