/**
 * @file purchase-request.types.ts
 * @description Purchase request tracking type definitions
 * @module @sakura/shared/types
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

export type PurchaseModeDto = "AUCTION" | "BUYOUT"

export interface PurchaseRequestDto {
  id: number
  user_id: string | null
  url: string
  web: string | null
  item_id: string | null
  title: string | null
  image_url: string | null
  end_time: string | null
  status: string
  current_price: number | null
  bid_count: number | null
  deliveryStages: DeliveryStageDto[]
  isDeliveried: boolean
  weight_gram: number | null
  shippingPrice: number | null
  intl_shipping_type: string | null
  lot: string | null
  bought_at: string | null
  purchase_mode: PurchaseModeDto
  created_at: string
  updated_at: string
}

export interface DeliveryStageDto {
  id: number
  stageTypeCode: string
  stageTypeNameTh: string
  status: string
  /** Per-stage payment settled flag (see backoffice weight update for stage 2, domestic pay for stage 3). */
  isPaid: boolean
  tracking_number: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
}

export interface PurchasePriceLogDto {
  id: number
  purchase_request_id: number
  price: number
  bid_count: number
  recorded_at: string
}
