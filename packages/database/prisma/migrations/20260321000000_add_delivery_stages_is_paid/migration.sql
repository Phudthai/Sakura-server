-- Per-stage payment flag (see domestic shipping / backoffice queue design)
ALTER TABLE "delivery_stages" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false;
