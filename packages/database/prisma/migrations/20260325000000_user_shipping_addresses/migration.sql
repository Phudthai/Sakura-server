-- CreateTable
CREATE TABLE "user_shipping_addresses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "phone" TEXT,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "subdistrict" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'TH',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_shipping_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_shipping_addresses_user_id_idx" ON "user_shipping_addresses"("user_id");

-- AddForeignKey
ALTER TABLE "user_shipping_addresses" ADD CONSTRAINT "user_shipping_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "payment_receipts" ADD COLUMN "shipping_address_id" INTEGER;

-- CreateIndex
CREATE INDEX "payment_receipts_shipping_address_id_idx" ON "payment_receipts"("shipping_address_id");

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "user_shipping_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
