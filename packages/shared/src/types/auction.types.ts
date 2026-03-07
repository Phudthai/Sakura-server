/**
 * @file auction.types.ts
 * @description Auction tracking type definitions
 * @module @sakura/shared/types
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

export interface AuctionRequestDto {
  id: number
  userId: string | null
  url: string
  yahooItemId: string | null
  title: string | null
  imageUrl: string | null
  endTime: string | null
  status: string
  currentPrice: number | null
  bidCount: number | null
  createdAt: string
  updatedAt: string
}

export interface AuctionPriceLogDto {
  id: number
  auctionRequestId: number
  price: number
  bidCount: number
  recordedAt: string
}
