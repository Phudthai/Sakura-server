-- Consolidate international shipping types: migrate INTL_SHIPPING_AIR and INTL_SHIPPING_SEA to single INTL_SHIPPING
-- (auction_requests.intl_shipping_type already stores air/sea)

-- Step 1: Insert INTL_SHIPPING if it doesn't exist
INSERT INTO payment_obligation_types (code, name_th, name_en)
SELECT 'INTL_SHIPPING', 'ค่าจัดส่งข้ามประเทศ', 'International shipping'
WHERE NOT EXISTS (SELECT 1 FROM payment_obligation_types WHERE code = 'INTL_SHIPPING');

-- Step 2: Update payment_obligations that use INTL_SHIPPING_AIR or INTL_SHIPPING_SEA to use INTL_SHIPPING
UPDATE payment_obligations
SET obligation_type_id = (SELECT id FROM payment_obligation_types WHERE code = 'INTL_SHIPPING' LIMIT 1)
WHERE obligation_type_id IN (
  SELECT id FROM payment_obligation_types WHERE code IN ('INTL_SHIPPING_AIR', 'INTL_SHIPPING_SEA')
);

-- Step 3: Delete the unused obligation types
DELETE FROM payment_obligation_types WHERE code IN ('INTL_SHIPPING_AIR', 'INTL_SHIPPING_SEA');
