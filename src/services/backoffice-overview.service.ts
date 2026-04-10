/**
 * Aggregates for backoffice overview — completed purchase requests in a calendar month (Bangkok),
 * filtered by intl shipping type and optional purchase mode (all / AUCTION / BUYOUT).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../packages/database/src";
import {
  computeProductIntlShippingBreakdown,
  type ObligationLite,
} from "./auction-intl-payment.service";

const COMPLETED_STATUS = "completed";

const BANGKOK_TZ = "Asia/Bangkok";

export type OverviewIntlShippingType = "air" | "sea";

export type OverviewPurchaseModeScope = "all" | "AUCTION" | "BUYOUT";

/** Start [start, end) in Asia/Bangkok for the given calendar month. */
function getBangkokMonthBoundsUtc(
  year: number,
  month: number,
): { start: Date; endExclusive: Date } {
  const start = new Date(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`,
  );
  let nextY = year;
  let nextM = month + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY = year + 1;
  }
  const endExclusive = new Date(
    `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+07:00`,
  );
  return { start, endExclusive };
}

const DOMESTIC_OBLIGATION_CODE = "DOMESTIC_SHIPPING";

/**
 * Domestic shipping (Thailand) for overview: not filtered by air/sea.
 * Month = Bangkok calendar month on payment_transactions.paid_at.
 * Only CONFIRMED txs on DOMESTIC_SHIPPING obligations with status PAID.
 */
export async function getDomesticShippingOverviewForBangkokMonth(params: {
  start: Date;
  endExclusive: Date;
}): Promise<{
  totalBaht: number;
  paidBaht: number;
  outstandingBaht: number;
}> {
  const { start, endExclusive } = params;

  const rows = await prisma.$queryRaw<
    { paid_baht: bigint | null; total_baht: bigint | null }[]
  >(
    Prisma.sql`
    WITH filtered AS (
      SELECT
        pt.amount AS tx_amount,
        po.id AS ob_id,
        po.amount AS ob_amount
      FROM payment_transactions pt
      INNER JOIN payment_obligations po ON pt.payment_obligation_id = po.id
      INNER JOIN payment_obligation_types pot ON po.obligation_type_id = pot.id
      WHERE pot.code = ${DOMESTIC_OBLIGATION_CODE}
        AND po.status = 'PAID'
        AND pt.status = 'CONFIRMED'
        AND pt.paid_at >= ${start}
        AND pt.paid_at < ${endExclusive}
    )
    SELECT
      COALESCE((SELECT SUM(tx_amount) FROM filtered), 0)::bigint AS paid_baht,
      COALESCE((
        SELECT SUM(s.ob_amount)::bigint
        FROM (
          SELECT ob_id, MAX(ob_amount) AS ob_amount
          FROM filtered
          GROUP BY ob_id
        ) s
      ), 0)::bigint AS total_baht
    `,
  );

  const row = rows[0];
  const paidBaht = Number(row?.paid_baht ?? 0);
  const totalBaht = Number(row?.total_baht ?? 0);
  const outstandingBaht = Math.max(0, totalBaht - paidBaht);

  return { totalBaht, paidBaht, outstandingBaht };
}

export async function getOverviewStats(params: {
  intlShippingType: OverviewIntlShippingType;
  year: number;
  month: number;
  purchaseMode: OverviewPurchaseModeScope;
}) {
  const { start, endExclusive } = getBangkokMonthBoundsUtc(
    params.year,
    params.month,
  );

  const where = {
    status: COMPLETED_STATUS,
    intl_shipping_type: params.intlShippingType,
    bought_at: {
      not: null,
      gte: start,
      lt: endExclusive,
    },
    ...(params.purchaseMode !== "all"
      ? { purchase_mode: params.purchaseMode }
      : {}),
  };

  const rows = await prisma.purchaseRequest.findMany({
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
  });

  let totalGrams = 0;
  let productTotalBaht = 0;
  let productPaidBaht = 0;
  let productOutstandingBaht = 0;
  let intlShippingTotalBaht = 0;
  let intlShippingPaidBaht = 0;
  let intlShippingOutstandingBaht = 0;

  for (const ar of rows) {
    totalGrams += ar.weight_gram ?? 0;

    const obligations: ObligationLite[] = ar.payment_obligations.map((o) => ({
      obligation_type: { code: o.obligation_type.code },
      amount: o.amount,
      transactions: o.transactions,
    }));

    const b = computeProductIntlShippingBreakdown({
      currentPriceBaht: ar.current_price_baht,
      weightGram: ar.weight_gram,
      intlShippingType: ar.intl_shipping_type,
      obligations,
    });

    productTotalBaht += b.productTotalBaht;
    productPaidBaht += b.productPaidBaht;
    productOutstandingBaht += b.productOutstandingBaht;
    intlShippingTotalBaht += b.intlShippingTotalBaht;
    intlShippingPaidBaht += b.intlShippingPaidBaht;
    intlShippingOutstandingBaht += b.intlShippingOutstandingBaht;
  }

  const itemCount = rows.length;

  const domesticShipping = await getDomesticShippingOverviewForBangkokMonth({
    start,
    endExclusive,
  });

  return {
    scope: {
      year: params.year,
      month: params.month,
      status: COMPLETED_STATUS,
      intlShippingType: params.intlShippingType,
      purchaseMode: params.purchaseMode,
      boughtAtRangeBangkok: {
        start: start.toISOString(),
        endExclusive: endExclusive.toISOString(),
      },
    },
    itemCount,
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
    domesticShipping: {
      totalBaht: domesticShipping.totalBaht,
      paidBaht: domesticShipping.paidBaht,
      outstandingBaht: domesticShipping.outstandingBaht,
    },
  };
}

/**
 * Distinct calendar months (Asia/Bangkok) that have at least one completed purchase_request
 * with bought_at, matching overview/stats scope (type + optional purchase_mode).
 * Month strings are `YYYY-M` (e.g. `2026-3`) for use as `month` on GET overview/stats.
 * Order: newest first (year DESC, month DESC).
 */
export async function getOverviewDistinctMonths(params: {
  intlShippingType: OverviewIntlShippingType;
  purchaseMode: OverviewPurchaseModeScope;
}): Promise<string[]> {
  const purchaseModeSql =
    params.purchaseMode === "all"
      ? Prisma.empty
      : Prisma.sql`AND purchase_mode = CAST(${params.purchaseMode} AS "PurchaseMode")`;

  const rows = await prisma.$queryRaw<{ month: number; year: number }[]>(
    Prisma.sql`
    SELECT DISTINCT
      EXTRACT(MONTH FROM bought_at AT TIME ZONE ${BANGKOK_TZ})::int AS month,
      EXTRACT(YEAR FROM bought_at AT TIME ZONE ${BANGKOK_TZ})::int AS year
    FROM purchase_requests
    WHERE status = ${COMPLETED_STATUS}
      AND bought_at IS NOT NULL
      AND intl_shipping_type = ${params.intlShippingType}
      ${purchaseModeSql}
    ORDER BY year DESC, month DESC
  `,
  );

  return rows.map((r) => `${r.year}-${r.month}`);
}
