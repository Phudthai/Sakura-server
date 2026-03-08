-- AlterTable: add slip fields to payment_obligations
ALTER TABLE "payment_obligations" ADD COLUMN IF NOT EXISTS "slip_reference" TEXT;
ALTER TABLE "payment_obligations" ADD COLUMN IF NOT EXISTS "slip_image_url" TEXT;

-- AlterTable: remove recorded_by from payment_transactions
ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "payment_transactions_recorded_by_fkey";
ALTER TABLE "payment_transactions" DROP COLUMN IF EXISTS "recorded_by";
