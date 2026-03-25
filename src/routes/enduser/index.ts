/**
 * @file index.ts
 * @description Enduser routes — combines all enduser route modules
 * Mount at /api/enduser
 */

import { Router } from 'express'
import { API_BASE_PATH } from '../../config'
import authRoutes from './auth.routes'
import auctionRoutes from './auction.routes'
import walletRoutes from './wallet.routes'
import checkStatusRoutes from './check-status.routes'
import shippingAddressRoutes from './shipping-address.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/auction-requests', auctionRoutes)
router.use('/wallet', walletRoutes)
router.use('/check-status', checkStatusRoutes)
router.use('/shipping-addresses', shippingAddressRoutes)

export const path = `${API_BASE_PATH}/enduser`
export { router }
