-- ETA (arrive_at) is display/planning; is_arrived confirms actual arrival (may differ from date).
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "is_arrived" BOOLEAN NOT NULL DEFAULT false;
