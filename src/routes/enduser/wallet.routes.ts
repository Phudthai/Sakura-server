/**
 * @file wallet.routes.ts
 * @description Enduser wallet routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as walletController from '../../controllers/enduser/wallet.controller'

const router = Router()

router.get('/', requireAuth(), walletController.getWallet)
router.post('/pay-obligation/:obligationId', requireAuth(), walletController.payObligation)

export default router
