-- CreateTable: user_wallets
CREATE TABLE "user_wallets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: wallet_transactions
CREATE TABLE "wallet_transactions" (
    "id" SERIAL NOT NULL,
    "wallet_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" INTEGER,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: payment_obligations - auction_request_id nullable, add user_id
ALTER TABLE "payment_obligations" ALTER COLUMN "auction_request_id" DROP NOT NULL;
ALTER TABLE "payment_obligations" ADD COLUMN IF NOT EXISTS "user_id" INTEGER;

-- AlterTable: payment_transactions - add source, wallet_transaction_id
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'BANK_SLIP';
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "wallet_transaction_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "user_wallets_user_id_key" ON "user_wallets"("user_id");
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");
CREATE INDEX "payment_obligations_user_id_idx" ON "payment_obligations"("user_id");

-- AddForeignKey
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "user_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create wallets for existing users (balance=0)
INSERT INTO "user_wallets" ("user_id", "balance", "currency", "version", "created_at", "updated_at")
SELECT "id", 0, 'THB', 0, NOW(), NOW()
FROM "users"
WHERE "id" NOT IN (SELECT "user_id" FROM "user_wallets");
