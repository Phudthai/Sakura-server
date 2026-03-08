-- 1. Currency THB: convert JPY obligations to THB (rate 0.265 if amount<1200, else 0.26)
UPDATE payment_obligations
SET
  amount = CASE WHEN amount < 1200 THEN ROUND(amount * 0.265) ELSE ROUND(amount * 0.26) END,
  currency = 'THB'
WHERE currency = 'JPY';

-- 2. Add slip columns to payment_transactions
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "slip_reference" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "slip_image_url" TEXT;

-- 3. Migrate slip data: obligations with slip but no transaction -> create transaction; obligations with slip and transaction -> update transaction
-- 3a: For obligations that have slip and at least one transaction - copy slip to first transaction
UPDATE payment_transactions pt
SET
  slip_reference = po.slip_reference,
  slip_image_url = po.slip_image_url
FROM payment_obligations po
WHERE pt.payment_obligation_id = po.id
  AND (po.slip_reference IS NOT NULL OR po.slip_image_url IS NOT NULL)
  AND pt.id = (
    SELECT id FROM payment_transactions
    WHERE payment_obligation_id = po.id
    ORDER BY paid_at ASC
    LIMIT 1
  );

-- 3b: For obligations that have slip but NO transaction - create a transaction with the slip
INSERT INTO payment_transactions (payment_obligation_id, amount, paid_at, slip_reference, slip_image_url)
SELECT id, amount, COALESCE(updated_at, created_at), slip_reference, slip_image_url
FROM payment_obligations
WHERE (slip_reference IS NOT NULL OR slip_image_url IS NOT NULL)
  AND id NOT IN (SELECT payment_obligation_id FROM payment_transactions);

-- 4. Drop slip columns from payment_obligations
ALTER TABLE "payment_obligations" DROP COLUMN IF EXISTS "slip_reference";
ALTER TABLE "payment_obligations" DROP COLUMN IF EXISTS "slip_image_url";
