-- AlterTable
ALTER TABLE "auction_requests" ADD COLUMN "is_deliveried" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "auction_requests" ADD COLUMN "weight_gram" INTEGER;
ALTER TABLE "auction_requests" ADD COLUMN "shipping_price" INTEGER;
ALTER TABLE "auction_requests" ADD COLUMN "shipping_type" TEXT;
ALTER TABLE "auction_requests" ADD COLUMN "paid" INTEGER;
ALTER TABLE "auction_requests" ADD COLUMN "outstanding_balance" INTEGER;
ALTER TABLE "auction_requests" ADD COLUMN "lot" TEXT;
ALTER TABLE "auction_requests" ADD COLUMN "bought_at" TIMESTAMP(3);
