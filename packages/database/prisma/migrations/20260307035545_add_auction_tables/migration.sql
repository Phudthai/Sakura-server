-- CreateTable
CREATE TABLE "auction_requests" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "contactName" TEXT,
    "url" TEXT NOT NULL,
    "yahooItemId" TEXT,
    "title" TEXT,
    "imageUrl" TEXT,
    "endTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
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
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_price_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auction_requests_status_idx" ON "auction_requests"("status");

-- CreateIndex
CREATE INDEX "auction_requests_userId_idx" ON "auction_requests"("userId");

-- CreateIndex
CREATE INDEX "auction_price_logs_auctionRequestId_idx" ON "auction_price_logs"("auctionRequestId");

-- AddForeignKey
ALTER TABLE "auction_requests" ADD CONSTRAINT "auction_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_price_logs" ADD CONSTRAINT "auction_price_logs_auctionRequestId_fkey" FOREIGN KEY ("auctionRequestId") REFERENCES "auction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
