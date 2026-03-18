-- Add bid_result column to auction_requests (won/lost/etc)
ALTER TABLE "auction_requests" ADD COLUMN IF NOT EXISTS "bid_result" TEXT;
