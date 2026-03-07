-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN', 'STAFF');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "user_code" TEXT,
    "external_id" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_requests" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "url" TEXT NOT NULL,
    "yahooItemId" TEXT,
    "title" TEXT,
    "imageUrl" TEXT,
    "endTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentPrice" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_price_logs" (
    "id" SERIAL NOT NULL,
    "auctionRequestId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "bidCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "biddedBy" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_price_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_user_code_key" ON "users"("user_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "auction_requests_status_idx" ON "auction_requests"("status");

-- CreateIndex
CREATE INDEX "auction_requests_userId_idx" ON "auction_requests"("userId");

-- CreateIndex
CREATE INDEX "auction_price_logs_auctionRequestId_idx" ON "auction_price_logs"("auctionRequestId");

-- CreateIndex
CREATE INDEX "auction_price_logs_biddedBy_idx" ON "auction_price_logs"("biddedBy");

-- AddForeignKey
ALTER TABLE "auction_requests" ADD CONSTRAINT "auction_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_price_logs" ADD CONSTRAINT "auction_price_logs_auctionRequestId_fkey" FOREIGN KEY ("auctionRequestId") REFERENCES "auction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_price_logs" ADD CONSTRAINT "auction_price_logs_biddedBy_fkey" FOREIGN KEY ("biddedBy") REFERENCES "staffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
