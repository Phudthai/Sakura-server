-- CreateEnum
CREATE TYPE "PurchaseMode" AS ENUM ('AUCTION', 'BUYOUT');

-- DropForeignKey: children referencing auction_requests
ALTER TABLE "auction_price_logs" DROP CONSTRAINT IF EXISTS "auction_price_logs_auction_request_id_fkey";
ALTER TABLE "auction_price_logs" DROP CONSTRAINT IF EXISTS "auction_price_logs_auctionRequestId_fkey";

ALTER TABLE "delivery_stages" DROP CONSTRAINT "delivery_stages_auction_request_id_fkey";

ALTER TABLE "payment_obligations" DROP CONSTRAINT "payment_obligations_auction_request_id_fkey";

ALTER TABLE "domestic_shipment_items" DROP CONSTRAINT "domestic_shipment_items_auction_request_id_fkey";

-- RenameTable
ALTER TABLE "auction_requests" RENAME TO "purchase_requests";

-- AlterTable: purchase_mode + rename constraints on parent for clarity
ALTER TABLE "purchase_requests" ADD COLUMN "purchase_mode" "PurchaseMode" NOT NULL DEFAULT 'AUCTION';

ALTER TABLE "purchase_requests" RENAME CONSTRAINT "auction_requests_pkey" TO "purchase_requests_pkey";
ALTER TABLE "purchase_requests" RENAME CONSTRAINT "auction_requests_userId_fkey" TO "purchase_requests_user_id_fkey";
ALTER TABLE "purchase_requests" RENAME CONSTRAINT "auction_requests_lot_id_fkey" TO "purchase_requests_lot_id_fkey";
ALTER TABLE "purchase_requests" RENAME CONSTRAINT "auction_requests_domestic_shipment_id_fkey" TO "purchase_requests_domestic_shipment_id_fkey";

-- RenameColumn on child tables
ALTER TABLE "auction_price_logs" RENAME COLUMN "auction_request_id" TO "purchase_request_id";
ALTER TABLE "delivery_stages" RENAME COLUMN "auction_request_id" TO "purchase_request_id";
ALTER TABLE "payment_obligations" RENAME COLUMN "auction_request_id" TO "purchase_request_id";
ALTER TABLE "domestic_shipment_items" RENAME COLUMN "auction_request_id" TO "purchase_request_id";

-- RenameIndex (child FK indexes / unique)
ALTER INDEX "auction_price_logs_auctionRequestId_idx" RENAME TO "auction_price_logs_purchase_request_id_idx";
ALTER INDEX "delivery_stages_auction_request_id_idx" RENAME TO "delivery_stages_purchase_request_id_idx";
ALTER INDEX "payment_obligations_auction_request_id_idx" RENAME TO "payment_obligations_purchase_request_id_idx";
ALTER INDEX "domestic_shipment_items_auction_request_id_key" RENAME TO "domestic_shipment_items_purchase_request_id_key";

-- RenameIndex on parent (index names kept old table prefix until now)
ALTER INDEX "auction_requests_status_idx" RENAME TO "purchase_requests_status_idx";
ALTER INDEX "auction_requests_userId_idx" RENAME TO "purchase_requests_user_id_idx";
ALTER INDEX "auction_requests_web_idx" RENAME TO "purchase_requests_web_idx";
ALTER INDEX "auction_requests_createdAt_idx" RENAME TO "purchase_requests_created_at_idx";
ALTER INDEX "auction_requests_status_createdAt_idx" RENAME TO "purchase_requests_status_created_at_idx";
ALTER INDEX "auction_requests_userId_createdAt_idx" RENAME TO "purchase_requests_user_id_created_at_idx";
ALTER INDEX "auction_requests_domestic_shipment_id_idx" RENAME TO "purchase_requests_domestic_shipment_id_idx";

-- Filter cron / queries by mode
CREATE INDEX "purchase_requests_purchase_mode_idx" ON "purchase_requests"("purchase_mode");

-- AddForeignKey
ALTER TABLE "auction_price_logs" ADD CONSTRAINT "auction_price_logs_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_stages" ADD CONSTRAINT "delivery_stages_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "domestic_shipment_items" ADD CONSTRAINT "domestic_shipment_items_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
