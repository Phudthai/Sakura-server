/**
 * @file wallet.routes.ts
 * @description Backoffice wallet routes
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as walletController from '../../controllers/backoffice/wallet.controller'

const router = Router()

router.post('/topup', requireAuth(['ADMIN', 'STAFF']), walletController.createTopupObligation)

export default router
