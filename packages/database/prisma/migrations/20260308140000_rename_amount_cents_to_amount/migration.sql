-- AlterTable
ALTER TABLE "payment_obligations" RENAME COLUMN "amount_cents" TO "amount";
ALTER TABLE "payment_transactions" RENAME COLUMN "amount_cents" TO "amount";
