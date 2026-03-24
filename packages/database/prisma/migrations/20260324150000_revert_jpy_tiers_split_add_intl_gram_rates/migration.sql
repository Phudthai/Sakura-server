-- Revert mistaken jpy_thb_rate_tiers intl_shipping_type (JPY→THB is product only; not per air/sea)
-- Then add intl_shipping_gram_rates for baht per gram (intl shipping fee)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jpy_thb_rate_tiers' AND column_name = 'intl_shipping_type'
  ) THEN
    DELETE FROM "jpy_thb_rate_tiers" WHERE "intl_shipping_type" = 'sea';
    DROP INDEX IF EXISTS "jpy_thb_rate_tiers_intl_shipping_type_sort_order_idx";
    ALTER TABLE "jpy_thb_rate_tiers" DROP COLUMN "intl_shipping_type";
  END IF;
END $$;

-- Configurable THB per gram for intl shipping (was hardcoded 0.59 air / 0.35 sea)
CREATE TABLE "intl_shipping_gram_rates" (
    "id" SERIAL NOT NULL,
    "intl_shipping_type" TEXT NOT NULL,
    "baht_per_gram" DECIMAL(10,6) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intl_shipping_gram_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intl_shipping_gram_rates_intl_shipping_type_key" ON "intl_shipping_gram_rates"("intl_shipping_type");

INSERT INTO "intl_shipping_gram_rates" ("intl_shipping_type", "baht_per_gram", "updated_at")
VALUES
  ('air', 0.59, CURRENT_TIMESTAMP),
  ('sea', 0.35, CURRENT_TIMESTAMP);
