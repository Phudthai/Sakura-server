/**
 * PRODUCT_FULL + INTL_SHIPPING totals and due/overdue — aligned with enduser check-status.
 */

import {
  bahtRoundUp,
  bangkokTodayYmd,
  calcIntlDueDateYmd,
} from "../../packages/shared/src"

export const SHIPPING_RATE_AIR = 0.59
export const SHIPPING_RATE_SEA = 0.35

export type ObligationLite = {
  obligation_type: { code: string }
  amount: number
  transactions: { amount: number }[]
}

export function computeIntlPaymentSnapshot(params: {
  currentPriceBaht: number | null
  weightGram: number | null
  intlShippingType: string | null
  boughtAt: Date | null
  obligations: ObligationLite[]
}): {
  intlTotal: number
  intlPaid: number
  dueDateYmd: string | null
  isOverdue: boolean
  intlOutstanding: boolean
} {
  const transport =
    params.intlShippingType === "air" || params.intlShippingType === "sea"
      ? params.intlShippingType
      : null

  const productOb = params.obligations.find((o) => o.obligation_type.code === "PRODUCT_FULL")
  const shippingOb = params.obligations.find((o) => o.obligation_type.code === "INTL_SHIPPING")
  const productPaid = productOb ? productOb.transactions.reduce((s, t) => s + t.amount, 0) : 0
  const shippingPaid = shippingOb ? shippingOb.transactions.reduce((s, t) => s + t.amount, 0) : 0

  const shippingRate =
    transport === "air" ? SHIPPING_RATE_AIR : transport === "sea" ? SHIPPING_RATE_SEA : SHIPPING_RATE_AIR
  const shipShippingCost =
    (params.weightGram ?? 0) > 0
      ? bahtRoundUp((params.weightGram ?? 0) * shippingRate)
      : shippingOb?.amount ?? 0

  const intlTotal = (params.currentPriceBaht ?? 0) + shipShippingCost
  const intlPaid = productPaid + shippingPaid
  const intlOutstanding = intlPaid < intlTotal

  const dueDateYmd =
    params.boughtAt && transport ? calcIntlDueDateYmd(params.boughtAt, transport) : null
  const today = bangkokTodayYmd()
  const isOverdue = dueDateYmd
    ? dueDateYmd < today && intlOutstanding
    : false

  return {
    intlTotal,
    intlPaid,
    dueDateYmd,
    isOverdue,
    intlOutstanding,
  }
}

/** Product vs INTL_SHIPPING amounts — same rules as computeIntlPaymentSnapshot (for backoffice aggregates). */
export function computeProductIntlShippingBreakdown(params: {
  currentPriceBaht: number | null
  weightGram: number | null
  intlShippingType: string | null
  obligations: ObligationLite[]
}): {
  productTotalBaht: number
  productPaidBaht: number
  productOutstandingBaht: number
  intlShippingTotalBaht: number
  intlShippingPaidBaht: number
  intlShippingOutstandingBaht: number
} {
  const transport =
    params.intlShippingType === "air" || params.intlShippingType === "sea"
      ? params.intlShippingType
      : null

  const productOb = params.obligations.find((o) => o.obligation_type.code === "PRODUCT_FULL")
  const shippingOb = params.obligations.find((o) => o.obligation_type.code === "INTL_SHIPPING")
  const productPaid = productOb ? productOb.transactions.reduce((s, t) => s + t.amount, 0) : 0
  const shippingPaid = shippingOb ? shippingOb.transactions.reduce((s, t) => s + t.amount, 0) : 0

  const shippingRate =
    transport === "air" ? SHIPPING_RATE_AIR : transport === "sea" ? SHIPPING_RATE_SEA : SHIPPING_RATE_AIR
  const intlShippingTotalBaht =
    (params.weightGram ?? 0) > 0
      ? bahtRoundUp((params.weightGram ?? 0) * shippingRate)
      : shippingOb?.amount ?? 0

  const productTotalBaht = params.currentPriceBaht ?? 0
  const productOutstandingBaht = Math.max(0, productTotalBaht - productPaid)
  const intlShippingOutstandingBaht = Math.max(0, intlShippingTotalBaht - shippingPaid)

  return {
    productTotalBaht,
    productPaidBaht: productPaid,
    productOutstandingBaht,
    intlShippingTotalBaht,
    intlShippingPaidBaht: shippingPaid,
    intlShippingOutstandingBaht,
  }
}
