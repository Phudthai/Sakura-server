-- CreateTable
CREATE TABLE "lots" (
    "id" SERIAL NOT NULL,
    "lot_code" TEXT NOT NULL,
    "intl_shipping_type" TEXT NOT NULL,
    "start_lot_at" TIMESTAMP(3),
    "end_lot_at" TIMESTAMP(3),
    "arrive_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lots_lot_code_intl_shipping_type_key" ON "lots"("lot_code", "intl_shipping_type");
CREATE INDEX "lots_lot_code_idx" ON "lots"("lot_code");
CREATE INDEX "lots_intl_shipping_type_idx" ON "lots"("intl_shipping_type");
CREATE INDEX "lots_intl_shipping_type_end_lot_at_idx" ON "lots"("intl_shipping_type", "end_lot_at");

-- AlterTable: add lot_id, drop lot
ALTER TABLE "auction_requests" ADD COLUMN "lot_id" INTEGER;

-- Drop old lot column if exists
ALTER TABLE "auction_requests" DROP COLUMN IF EXISTS "lot";

-- AddForeignKey
ALTER TABLE "auction_requests" ADD CONSTRAINT "auction_requests_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
