-- Add currentPrice and note to auction_requests
ALTER TABLE "auction_requests" ADD COLUMN IF NOT EXISTS "currentPrice" INTEGER;
ALTER TABLE "auction_requests" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- Add status and biddedBy to auction_price_logs
ALTER TABLE "auction_price_logs" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "auction_price_logs" ADD COLUMN IF NOT EXISTS "biddedBy" INTEGER;

-- Create staffs table
CREATE TABLE IF NOT EXISTS "staffs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffs_pkey" PRIMARY KEY ("id")
);

-- Add FK biddedBy -> staffs (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'auction_price_logs_biddedBy_fkey'
    ) THEN
        ALTER TABLE "auction_price_logs" ADD CONSTRAINT "auction_price_logs_biddedBy_fkey"
            FOREIGN KEY ("biddedBy") REFERENCES "staffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Add index for biddedBy
CREATE INDEX IF NOT EXISTS "auction_price_logs_biddedBy_idx" ON "auction_price_logs"("biddedBy");
