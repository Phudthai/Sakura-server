-- Remove redundant slip_image_url from payment_transactions
-- Slip image is stored in payment_receipts; transactions with payment_receipt_id get it via join
ALTER TABLE "payment_transactions" DROP COLUMN IF EXISTS "slip_image_url";
