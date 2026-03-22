/**
 * @file overview.routes.ts
 * @description Backoffice overview routes
 */

import { Router } from "express"
import { requireAuth } from "../../middleware/auth.middleware"
import * as overviewController from "../../controllers/backoffice/overview.controller"

const router = Router()

router.get(
  "/overview/stats",
  requireAuth(["ADMIN", "STAFF"]),
  overviewController.getOverviewStatsHandler,
)

export default router
