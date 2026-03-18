-- Add status and rejection_reason to payment_transactions
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
CREATE INDEX IF NOT EXISTS "payment_transactions_status_idx" ON "payment_transactions"("status");
