-- Consolidate product payment types: migrate PRODUCT_DEPOSIT and PRODUCT_BALANCE to PRODUCT_FULL, then remove unused types

-- Step 1: Update payment_obligations that use PRODUCT_DEPOSIT or PRODUCT_BALANCE to use PRODUCT_FULL
UPDATE payment_obligations
SET obligation_type_id = (SELECT id FROM payment_obligation_types WHERE code = 'PRODUCT_FULL' LIMIT 1)
WHERE obligation_type_id IN (
  SELECT id FROM payment_obligation_types WHERE code IN ('PRODUCT_DEPOSIT', 'PRODUCT_BALANCE')
);

-- Step 2: Delete the unused obligation types
DELETE FROM payment_obligation_types WHERE code IN ('PRODUCT_DEPOSIT', 'PRODUCT_BALANCE');
