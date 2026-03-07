import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import * as authController from '../controllers/auth.controller'

const router = Router()

router.post('/login', authController.login)
router.post('/register', authController.register)
router.get('/me', requireAuth(), authController.me)

export default router
