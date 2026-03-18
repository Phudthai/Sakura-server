-- Add year to payment_receipts for allocation filtering
ALTER TABLE "payment_receipts" ADD COLUMN IF NOT EXISTS "year" INTEGER;
