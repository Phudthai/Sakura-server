-- null = legacy monthly intl slip; DOMESTIC_SHIPPING = domestic fee slip (same upload route, different allocation)
ALTER TABLE "payment_receipts" ADD COLUMN IF NOT EXISTS "purpose" TEXT;

CREATE INDEX IF NOT EXISTS "payment_receipts_user_id_purpose_status_idx" ON "payment_receipts" ("user_id", "purpose", "status");
