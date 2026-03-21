-- User-scoped DOMESTIC_SHIPPING: backfill user_id, merge duplicate PENDING rows per user, clear auction_request_id.

UPDATE payment_obligations po
SET user_id = ar.user_id
FROM auction_requests ar
WHERE po.auction_request_id = ar.id
  AND po.user_id IS NULL
  AND po.obligation_type_id = (SELECT id FROM payment_obligation_types WHERE code = 'DOMESTIC_SHIPPING');

UPDATE payment_obligations po
SET amount = agg.total, auction_request_id = NULL
FROM (
  SELECT po2.user_id, MIN(po2.id) AS keeper_id, SUM(po2.amount) AS total
  FROM payment_obligations po2
  INNER JOIN payment_obligation_types t2 ON t2.id = po2.obligation_type_id
  WHERE t2.code = 'DOMESTIC_SHIPPING' AND po2.status = 'PENDING' AND po2.user_id IS NOT NULL
  GROUP BY po2.user_id
) agg
WHERE po.id = agg.keeper_id;

UPDATE payment_transactions pt
SET payment_obligation_id = k.keeper_id
FROM payment_obligations po
INNER JOIN payment_obligation_types t ON t.id = po.obligation_type_id
INNER JOIN (
  SELECT po2.user_id, MIN(po2.id) AS keeper_id
  FROM payment_obligations po2
  INNER JOIN payment_obligation_types t2 ON t2.id = po2.obligation_type_id
  WHERE t2.code = 'DOMESTIC_SHIPPING' AND po2.status = 'PENDING' AND po2.user_id IS NOT NULL
  GROUP BY po2.user_id
) k ON k.user_id = po.user_id
WHERE pt.payment_obligation_id = po.id
  AND t.code = 'DOMESTIC_SHIPPING'
  AND po.status = 'PENDING'
  AND po.id <> k.keeper_id;

DELETE FROM payment_obligations po
USING payment_obligation_types t,
(
  SELECT po2.user_id, MIN(po2.id) AS keeper_id
  FROM payment_obligations po2
  INNER JOIN payment_obligation_types t2 ON t2.id = po2.obligation_type_id
  WHERE t2.code = 'DOMESTIC_SHIPPING' AND po2.status = 'PENDING' AND po2.user_id IS NOT NULL
  GROUP BY po2.user_id
) k
WHERE t.id = po.obligation_type_id
  AND t.code = 'DOMESTIC_SHIPPING'
  AND po.status = 'PENDING'
  AND po.user_id = k.user_id
  AND po.id <> k.keeper_id;

UPDATE payment_obligations po
SET auction_request_id = NULL
FROM payment_obligation_types t
WHERE t.id = po.obligation_type_id
  AND t.code = 'DOMESTIC_SHIPPING'
  AND po.auction_request_id IS NOT NULL;
