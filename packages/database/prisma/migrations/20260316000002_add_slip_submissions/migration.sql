-- CreateTable: payment_receipts
CREATE TABLE "payment_receipts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "slip_image_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "rejection_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "month" INTEGER,
    "transport_type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- AlterTable: payment_transactions - add payment_receipt_id
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "payment_receipt_id" INTEGER;

-- CreateIndex
CREATE INDEX "payment_receipts_user_id_idx" ON "payment_receipts"("user_id");
CREATE INDEX "payment_receipts_status_idx" ON "payment_receipts"("status");
CREATE INDEX "payment_receipts_month_transport_type_idx" ON "payment_receipts"("month", "transport_type");
CREATE INDEX "payment_transactions_payment_receipt_id_idx" ON "payment_transactions"("payment_receipt_id");

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_receipt_id_fkey" FOREIGN KEY ("payment_receipt_id") REFERENCES "payment_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
