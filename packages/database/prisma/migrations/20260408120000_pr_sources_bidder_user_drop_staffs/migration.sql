-- Purchase request source / client entry
ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "auction_source" TEXT;
ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "buyout_source" TEXT;
ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "client_entry" TEXT;

-- Re-point auction bid actor from staffs to users (historical staff ids are not valid user ids)
UPDATE "auction_price_logs" SET "bidded_by" = NULL;

ALTER TABLE "auction_price_logs" DROP CONSTRAINT IF EXISTS "auction_price_logs_biddedBy_fkey";

ALTER TABLE "auction_price_logs"
  ADD CONSTRAINT "auction_price_logs_bidded_by_fkey"
  FOREIGN KEY ("bidded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE IF EXISTS "staffs";
