-- CreateIndex
CREATE INDEX "auction_requests_createdAt_idx" ON "auction_requests"("createdAt");

-- CreateIndex
CREATE INDEX "auction_requests_status_createdAt_idx" ON "auction_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "auction_requests_userId_createdAt_idx" ON "auction_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "auction_price_logs_status_recordedAt_idx" ON "auction_price_logs"("status", "recordedAt");
