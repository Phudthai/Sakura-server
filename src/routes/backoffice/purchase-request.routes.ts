/**
 * @file purchase-request.routes.ts
 * @description Backoffice purchase request routes
 */

import * as fs from "fs";
import * as path from "path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.middleware";
import * as purchaseRequestController from "../../controllers/backoffice/purchase-request.controller";
import * as bidsController from "../../controllers/backoffice/bids.controller";

const router = Router();

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
    cb(null, `bo-pr-${Date.now()}${ext}`);
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

function optionalSlipUpload(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const ct = String(req.headers["content-type"] ?? "");
  if (ct.includes("multipart/form-data")) {
    upload.single("slip")(req, res, next);
    return;
  }
  next();
}

router.get(
  "/domestic-shipping-queue",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.listDomesticShippingQueue,
);
router.patch(
  "/domestic-shipping-queue/:userId",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.updateDomesticShipping,
);
router.get(
  "/domestic-shipping-queue/:userId/items",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.getDomesticShippingQueueItems,
);
router.get(
  "/purchase-requests",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.listAuctionsBackoffice,
);
router.post(
  "/purchase-requests",
  requireAuth(["ADMIN", "STAFF"]),
  optionalSlipUpload,
  purchaseRequestController.createAuctionBackoffice,
);
router.post(
  "/purchase-requests/:id/bids",
  requireAuth(["ADMIN", "STAFF"]),
  bidsController.submitBidBackoffice,
);
router.patch(
  "/purchase-requests/:id/note",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.updateAuctionNote,
);
router.patch(
  "/purchase-requests/:id/lot",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.assignLotToAuction,
);
router.patch(
  "/purchase-requests/:id/weight-gram",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.updateAuctionWeightGram,
);
router.patch(
  "/purchase-requests/:id",
  requireAuth(["ADMIN", "STAFF"]),
  purchaseRequestController.updateAuctionStatus,
);

export default router;
