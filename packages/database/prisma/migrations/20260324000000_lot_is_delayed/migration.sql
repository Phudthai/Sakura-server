-- Manual "delayed" flag for end-user lot display (ล่าช้า** prefix).
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "is_delayed" BOOLEAN NOT NULL DEFAULT false;
