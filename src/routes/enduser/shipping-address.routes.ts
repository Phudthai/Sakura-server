/**
 * @file shipping-address.routes.ts
 * @description Enduser shipping addresses CRUD
 */

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import * as shippingAddressController from '../../controllers/enduser/shipping-address.controller'

const router = Router()

router.get('/', requireAuth(), shippingAddressController.listShippingAddresses)
router.post('/', requireAuth(), shippingAddressController.createShippingAddress)
router.patch('/:id', requireAuth(), shippingAddressController.updateShippingAddress)
router.delete('/:id', requireAuth(), shippingAddressController.deleteShippingAddress)

export default router
