-- CreateTable
CREATE TABLE "payment_obligation_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,

    CONSTRAINT "payment_obligation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_obligations" (
    "id" SERIAL NOT NULL,
    "auction_request_id" INTEGER NOT NULL,
    "obligation_type_id" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" SERIAL NOT NULL,
    "payment_obligation_id" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recorded_by" INTEGER,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_obligation_types_code_key" ON "payment_obligation_types"("code");

-- CreateIndex
CREATE INDEX "payment_obligations_auction_request_id_idx" ON "payment_obligations"("auction_request_id");
CREATE INDEX "payment_obligations_status_idx" ON "payment_obligations"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_obligation_id_idx" ON "payment_transactions"("payment_obligation_id");

-- AlterTable: rename shipping_type to intl_shipping_type, drop paid and outstanding_balance
ALTER TABLE "auction_requests" RENAME COLUMN "shipping_type" TO "intl_shipping_type";
ALTER TABLE "auction_requests" DROP COLUMN IF EXISTS "paid";
ALTER TABLE "auction_requests" DROP COLUMN IF EXISTS "outstanding_balance";

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_auction_request_id_fkey" FOREIGN KEY ("auction_request_id") REFERENCES "auction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_obligation_type_id_fkey" FOREIGN KEY ("obligation_type_id") REFERENCES "payment_obligation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_obligation_id_fkey" FOREIGN KEY ("payment_obligation_id") REFERENCES "payment_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "staffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
