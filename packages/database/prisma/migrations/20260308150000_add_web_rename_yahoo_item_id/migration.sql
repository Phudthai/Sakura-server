-- AlterTable: add web, rename yahooItemId to item_id
ALTER TABLE "auction_requests" ADD COLUMN "web" TEXT DEFAULT 'yahoo';
ALTER TABLE "auction_requests" RENAME COLUMN "yahooItemId" TO "item_id";

-- CreateIndex
CREATE INDEX "auction_requests_web_idx" ON "auction_requests"("web");
