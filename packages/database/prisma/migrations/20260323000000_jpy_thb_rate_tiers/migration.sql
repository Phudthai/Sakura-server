-- CreateTable
CREATE TABLE "jpy_thb_rate_tiers" (
    "id" SERIAL NOT NULL,
    "min_jpy" INTEGER NOT NULL,
    "max_jpy" INTEGER,
    "rate" DECIMAL(10,6) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jpy_thb_rate_tiers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jpy_thb_rate_tiers_sort_order_idx" ON "jpy_thb_rate_tiers"("sort_order");

-- Seed: same logic as legacy jpyToBaht (0.265 if jpy < 1200 else 0.26)
INSERT INTO "jpy_thb_rate_tiers" ("min_jpy", "max_jpy", "rate", "sort_order", "updated_at")
VALUES
  (0, 1200, 0.265, 0, CURRENT_TIMESTAMP),
  (1200, NULL, 0.26, 1, CURRENT_TIMESTAMP);
