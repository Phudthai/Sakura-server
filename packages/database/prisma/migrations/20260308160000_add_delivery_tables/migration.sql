-- CreateTable
CREATE TABLE "delivery_stage_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_stage_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_stages" (
    "id" SERIAL NOT NULL,
    "auction_request_id" INTEGER NOT NULL,
    "stage_type_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tracking_number" TEXT,
    "carrier" TEXT,
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_stage_types_code_key" ON "delivery_stage_types"("code");

-- CreateIndex
CREATE INDEX "delivery_stages_auction_request_id_idx" ON "delivery_stages"("auction_request_id");
CREATE INDEX "delivery_stages_status_idx" ON "delivery_stages"("status");

-- AlterTable: drop is_deliveried from auction_requests
ALTER TABLE "auction_requests" DROP COLUMN IF EXISTS "is_deliveried";

-- AddForeignKey
ALTER TABLE "delivery_stages" ADD CONSTRAINT "delivery_stages_auction_request_id_fkey" FOREIGN KEY ("auction_request_id") REFERENCES "auction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_stages" ADD CONSTRAINT "delivery_stages_stage_type_id_fkey" FOREIGN KEY ("stage_type_id") REFERENCES "delivery_stage_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
