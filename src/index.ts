/**
 * @file index.ts
 * @description Express API server entry point
 * @module @sakura/api
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "../packages/database/src";
import { API_BASE_PATH } from "./config";
import * as enduser from "./routes/enduser";
import * as backoffice from "./routes/backoffice";
import { startAuctionCron } from "./jobs/auction-cron.job";

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Response time logging (dev: all requests, prod: slow only >500ms)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (ms > 500) console.warn(`[SLOW] ${req.method} ${req.path} ${ms}ms`);
    else if (process.env.NODE_ENV === "development")
      console.log(`${req.method} ${req.path} ${ms}ms`);
  });
  next();
});

// Static files: uploads (slip images)
app.use("/uploads", express.static("uploads"));

// Routes
app.use(enduser.path, enduser.router);
app.use(backoffice.path, backoffice.router);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Test database connection
app.get(`${API_BASE_PATH}/test-db`, async (_req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      success: true,
      message: "Database connected",
      userCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Database connection failed",
    });
  }
});

// Start server (warm DB connection pool before accepting requests)
async function start() {
  await prisma.$connect();
  console.log("Database connected");

  app.listen(PORT, () => {
    console.log(`🚀 API server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    startAuctionCron();
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
