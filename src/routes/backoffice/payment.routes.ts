/**
 * @file payment.routes.ts
 * @description Backoffice payment slip upload routes
 */

import { Router } from 'express'
import multer from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { requireAuth } from '../../middleware/auth.middleware'
import * as paymentController from '../../controllers/backoffice/payment.controller'

const router = Router()
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'slips')

function ensureUploadsDir(): void {
  if (!fs.existsSync(path.join(process.cwd(), 'uploads'))) {
    fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true })
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir()
    cb(null, UPLOADS_DIR)
  },
  filename: (req, file, cb) => {
    const id = req.params.id ?? 'unknown'
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${id}-${Date.now()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i
    if (allowed.test(file.originalname)) {
      cb(null, true)
    } else {
      cb(null, false)
    }
  },
})

router.post(
  '/:id/slip',
  requireAuth(['ADMIN', 'STAFF']),
  upload.single('slip'),
  paymentController.uploadSlip
)

export default router
