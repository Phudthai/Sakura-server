/**
 * @file check-status.routes.ts
 * @description Enduser check status — slip submit and status by month+transportType
 */

import { Router } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { requireAuth } from "../../middleware/auth.middleware";
import * as slipController from "../../controllers/enduser/slip.controller";
import * as checkStatusController from "../../controllers/enduser/check-status.controller";

const router = Router();

router.get("/domestic-pending-items", requireAuth(), checkStatusController.getDomesticPendingItems);
router.get("/", requireAuth(), checkStatusController.getCheckStatus);
router.get("/months", requireAuth(), checkStatusController.getMonths);
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "slips");

function ensureUploadsDir(): void {
  if (!fs.existsSync(path.join(process.cwd(), "uploads"))) {
    fs.mkdirSync(path.join(process.cwd(), "uploads"), { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `receipt-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

router.post(
  "/submit-slip",
  requireAuth(),
  upload.single("slip"),
  slipController.submitSlip,
);
router.get("/slip-status", requireAuth(), slipController.getSlipStatus);

export default router;
