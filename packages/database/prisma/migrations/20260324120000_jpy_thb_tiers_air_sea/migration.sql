-- JPY→THB tiers per international shipping channel (air / sea)

ALTER TABLE "jpy_thb_rate_tiers" ADD COLUMN "intl_shipping_type" TEXT NOT NULL DEFAULT 'air';

-- Existing rows become air; duplicate same tier ladder for sea
INSERT INTO "jpy_thb_rate_tiers" ("min_jpy", "max_jpy", "rate", "sort_order", "created_at", "updated_at", "intl_shipping_type")
SELECT "min_jpy", "max_jpy", "rate", "sort_order", "created_at", "updated_at", 'sea'
FROM "jpy_thb_rate_tiers"
WHERE "intl_shipping_type" = 'air';

CREATE INDEX "jpy_thb_rate_tiers_intl_shipping_type_sort_order_idx" ON "jpy_thb_rate_tiers"("intl_shipping_type", "sort_order");
