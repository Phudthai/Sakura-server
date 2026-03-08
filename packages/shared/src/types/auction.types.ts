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
  web: string | null
  itemId: string | null
  title: string | null
  imageUrl: string | null
  endTime: string | null
  status: string
  currentPrice: number | null
  bidCount: number | null
  deliveryStages: DeliveryStageDto[]
  isDeliveried: boolean
  weightGram: number | null
  shippingPrice: number | null
  intlShippingType: string | null
  lot: string | null
  boughtAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DeliveryStageDto {
  id: number
  stageTypeCode: string
  stageTypeNameTh: string
  status: string
  trackingNumber: string | null
  carrier: string | null
  shippedAt: string | null
  deliveredAt: string | null
}

export interface AuctionPriceLogDto {
  id: number
  auctionRequestId: number
  price: number
  bidCount: number
  recordedAt: string
}
