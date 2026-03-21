/**
 * User-level DOMESTIC_SHIPPING obligations and delivery stage 3 is_paid flags.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '../../packages/database/src'

type Db = Prisma.TransactionClient | typeof prisma

const STAGE_DOMESTIC_CODE = 'STAGE_3_DOMESTIC_CUSTOMER'

let cachedDomesticStageTypeId: number | null = null

export async function getDomesticCustomerStageTypeId(): Promise<number> {
  if (cachedDomesticStageTypeId != null) return cachedDomesticStageTypeId
  const row = await prisma.deliveryStageType.findUnique({
    where: { code: STAGE_DOMESTIC_CODE },
    select: { id: true },
  })
  if (!row) throw new Error(`delivery_stage_types missing ${STAGE_DOMESTIC_CODE}`)
  cachedDomesticStageTypeId = row.id
  return row.id
}

export type DomesticPendingItemPayload = {
  pendingDomesticItemCount: number
  domesticPendingBaht: number | null
  items: Array<{
    id: number
    title: string | null
    imageUrl: string | null
    status: string
    bidResult: string | null
    weightGram: number | null
    currentPriceBaht: number | null
    boughtAt: string | null
    lot: {
      id: number
      lotCode: string | null
      isArrived: boolean
      arriveAt: string | null
    } | null
    deliveryStages: Array<{
      id: number
      stageTypeCode: string
      stageTypeNameTh: string | null
      status: string
      isPaid: boolean
      trackingNumber: string | null
      carrier: string | null
      shippedAt: string | null
      deliveredAt: string | null
    }>
  }>
}

/**
 * Same rules as backoffice domestic shipping queue: lot arrived, PRODUCT_FULL + INTL_SHIPPING PAID,
 * stage 3 (domestic customer) not yet paid.
 */
export async function getDomesticShippingPendingItemsForUser(
  userId: number,
): Promise<DomesticPendingItemPayload> {
  const stageTypeId = await getDomesticCustomerStageTypeId()

  const rows = await prisma.auctionRequest.findMany({
    where: {
      user_id: userId,
      lot_id: { not: null },
      lot: { is_arrived: true },
      delivery_stages: {
        some: { stage_type_id: stageTypeId, is_paid: false },
      },
      AND: [
        {
          payment_obligations: {
            some: { obligation_type: { code: 'PRODUCT_FULL' }, status: 'PAID' },
          },
        },
        {
          payment_obligations: {
            some: { obligation_type: { code: 'INTL_SHIPPING' }, status: 'PAID' },
          },
        },
      ],
    },
    include: {
      lot: {
        select: {
          id: true,
          lot_code: true,
          is_arrived: true,
          arrive_at: true,
        },
      },
      delivery_stages: {
        include: { stage_type: true },
        orderBy: { stage_type: { sort_order: 'asc' } },
      },
    },
    orderBy: [{ bought_at: 'asc' }, { id: 'asc' }],
  })

  const domesticType = await prisma.paymentObligationType.findUnique({
    where: { code: 'DOMESTIC_SHIPPING' },
  })
  const domesticOb =
    domesticType != null
      ? await prisma.paymentObligation.findFirst({
          where: {
            user_id: userId,
            obligation_type_id: domesticType.id,
            status: 'PENDING',
          },
        })
      : null

  const items = rows.map((r) => {
    const stages = r.delivery_stages.map((s) => ({
      id: s.id,
      stageTypeCode: s.stage_type.code,
      stageTypeNameTh: s.stage_type.name_th,
      status: s.status,
      isPaid: s.is_paid,
      trackingNumber: s.tracking_number ?? null,
      carrier: s.carrier ?? null,
      shippedAt: s.shipped_at?.toISOString() ?? null,
      deliveredAt: s.delivered_at?.toISOString() ?? null,
    }))
    return {
      id: r.id,
      title: r.title,
      imageUrl: r.image_url,
      status: r.status,
      bidResult: r.bid_result,
      weightGram: r.weight_gram,
      currentPriceBaht: r.current_price_baht,
      boughtAt: r.bought_at?.toISOString() ?? null,
      lot: r.lot
        ? {
            id: r.lot.id,
            lotCode: r.lot.lot_code,
            isArrived: r.lot.is_arrived,
            arriveAt: r.lot.arrive_at?.toISOString() ?? null,
          }
        : null,
      deliveryStages: stages,
    }
  })

  return {
    pendingDomesticItemCount: items.length,
    domesticPendingBaht: domesticOb?.amount ?? null,
    items,
  }
}

/**
 * After the user-level domestic shipping obligation is fully paid, mark stage 3 is_paid on all
 * auction items for this user that were still waiting on domestic payment.
 */
export async function markUserDomesticStage3Paid(userId: number, tx?: Db): Promise<void> {
  const db = tx ?? prisma
  const stageTypeId = await getDomesticCustomerStageTypeId()
  await db.deliveryStage.updateMany({
    where: {
      stage_type_id: stageTypeId,
      is_paid: false,
      auction_request: { user_id: userId },
    },
    data: { is_paid: true },
  })
}
