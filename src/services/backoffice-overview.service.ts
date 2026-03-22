/**
 * Aggregates for backoffice overview — completed auctions, required intl type.
 * Omit lotId: aggregate every completed auction for that air/sea (any lot).
 * Set lotId: restrict to that lot (must match intl type — validated in controller).
 */

import { prisma } from "../../packages/database/src"
import {
  computeProductIntlShippingBreakdown,
  type ObligationLite,
} from "./auction-intl-payment.service"

const COMPLETED_STATUS = "completed"

export type OverviewIntlShippingType = "air" | "sea"

export async function getOverviewStats(params: {
  lotId: number | null
  intlShippingType: OverviewIntlShippingType
}) {
  const where = {
    status: COMPLETED_STATUS,
    intl_shipping_type: params.intlShippingType,
    ...(params.lotId != null ? { lot_id: params.lotId } : {}),
  }

  const rows = await prisma.auctionRequest.findMany({
    where,
    select: {
      id: true,
      weight_gram: true,
      current_price_baht: true,
      intl_shipping_type: true,
      payment_obligations: {
        select: {
          amount: true,
          obligation_type: { select: { code: true } },
          transactions: { select: { amount: true } },
        },
      },
    },
  })

  let totalGrams = 0
  let productTotalBaht = 0
  let productPaidBaht = 0
  let productOutstandingBaht = 0
  let intlShippingTotalBaht = 0
  let intlShippingPaidBaht = 0
  let intlShippingOutstandingBaht = 0

  for (const ar of rows) {
    totalGrams += ar.weight_gram ?? 0

    const obligations: ObligationLite[] = ar.payment_obligations.map((o) => ({
      obligation_type: { code: o.obligation_type.code },
      amount: o.amount,
      transactions: o.transactions,
    }))

    const b = computeProductIntlShippingBreakdown({
      currentPriceBaht: ar.current_price_baht,
      weightGram: ar.weight_gram,
      intlShippingType: ar.intl_shipping_type,
      obligations,
    })

    productTotalBaht += b.productTotalBaht
    productPaidBaht += b.productPaidBaht
    productOutstandingBaht += b.productOutstandingBaht
    intlShippingTotalBaht += b.intlShippingTotalBaht
    intlShippingPaidBaht += b.intlShippingPaidBaht
    intlShippingOutstandingBaht += b.intlShippingOutstandingBaht
  }

  return {
    scope: {
      lotId: params.lotId,
      status: COMPLETED_STATUS,
      intlShippingType: params.intlShippingType,
    },
    totalGrams,
    product: {
      totalBaht: productTotalBaht,
      paidBaht: productPaidBaht,
      outstandingBaht: productOutstandingBaht,
    },
    intlShipping: {
      totalBaht: intlShippingTotalBaht,
      paidBaht: intlShippingPaidBaht,
      outstandingBaht: intlShippingOutstandingBaht,
    },
  }
}
