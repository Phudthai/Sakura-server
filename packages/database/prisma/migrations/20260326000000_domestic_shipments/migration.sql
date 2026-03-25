-- CreateTable
CREATE TABLE "domestic_shipments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "payment_receipt_id" INTEGER,
    "shipping_address_id" INTEGER,
    "tracking_number" TEXT,
    "carrier" TEXT,
    "shipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domestic_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domestic_shipments_payment_receipt_id_key" ON "domestic_shipments"("payment_receipt_id");

-- CreateIndex
CREATE INDEX "domestic_shipments_user_id_idx" ON "domestic_shipments"("user_id");

-- CreateIndex
CREATE INDEX "domestic_shipments_shipping_address_id_idx" ON "domestic_shipments"("shipping_address_id");

-- AddForeignKey
ALTER TABLE "domestic_shipments" ADD CONSTRAINT "domestic_shipments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domestic_shipments" ADD CONSTRAINT "domestic_shipments_payment_receipt_id_fkey" FOREIGN KEY ("payment_receipt_id") REFERENCES "payment_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domestic_shipments" ADD CONSTRAINT "domestic_shipments_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "user_shipping_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "domestic_shipment_items" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "auction_request_id" INTEGER NOT NULL,

    CONSTRAINT "domestic_shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domestic_shipment_items_auction_request_id_key" ON "domestic_shipment_items"("auction_request_id");

-- CreateIndex
CREATE INDEX "domestic_shipment_items_shipment_id_idx" ON "domestic_shipment_items"("shipment_id");

-- AddForeignKey
ALTER TABLE "domestic_shipment_items" ADD CONSTRAINT "domestic_shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "domestic_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domestic_shipment_items" ADD CONSTRAINT "domestic_shipment_items_auction_request_id_fkey" FOREIGN KEY ("auction_request_id") REFERENCES "auction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "auction_requests" ADD COLUMN "domestic_shipment_id" INTEGER;

-- CreateIndex
CREATE INDEX "auction_requests_domestic_shipment_id_idx" ON "auction_requests"("domestic_shipment_id");

-- AddForeignKey
ALTER TABLE "auction_requests" ADD CONSTRAINT "auction_requests_domestic_shipment_id_fkey" FOREIGN KEY ("domestic_shipment_id") REFERENCES "domestic_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
