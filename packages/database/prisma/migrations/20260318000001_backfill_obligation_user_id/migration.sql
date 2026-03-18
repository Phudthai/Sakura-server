-- Backfill user_id on payment_obligations from auction_requests
UPDATE payment_obligations po
SET user_id = ar."userId"
FROM auction_requests ar
WHERE po.auction_request_id = ar.id
  AND po.user_id IS NULL
  AND ar."userId" IS NOT NULL;
