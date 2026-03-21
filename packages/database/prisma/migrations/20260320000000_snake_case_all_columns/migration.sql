-- Migration: rename camelCase columns to snake_case
-- PostgreSQL RENAME COLUMN auto-updates FK constraints and indexes

-- users
ALTER TABLE users RENAME COLUMN "isEmailVerified" TO is_email_verified;
ALTER TABLE users RENAME COLUMN "isActive" TO is_active;
ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;

-- lots
ALTER TABLE lots RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE lots RENAME COLUMN "updatedAt" TO updated_at;

-- auction_requests
ALTER TABLE auction_requests RENAME COLUMN "userId" TO user_id;
ALTER TABLE auction_requests RENAME COLUMN "imageUrl" TO image_url;
ALTER TABLE auction_requests RENAME COLUMN "endTime" TO end_time;
ALTER TABLE auction_requests RENAME COLUMN "currentPrice" TO current_price;
ALTER TABLE auction_requests RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE auction_requests RENAME COLUMN "updatedAt" TO updated_at;

-- auction_price_logs
ALTER TABLE auction_price_logs RENAME COLUMN "auctionRequestId" TO auction_request_id;
ALTER TABLE auction_price_logs RENAME COLUMN "bidCount" TO bid_count;
ALTER TABLE auction_price_logs RENAME COLUMN "biddedBy" TO bidded_by;
ALTER TABLE auction_price_logs RENAME COLUMN "recordedAt" TO recorded_at;

-- staffs
ALTER TABLE staffs RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE staffs RENAME COLUMN "updatedAt" TO updated_at;

-- payment_receipts
ALTER TABLE payment_receipts RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE payment_receipts RENAME COLUMN "updatedAt" TO updated_at;
