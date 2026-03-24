/**
 * When a lot is confirmed arrived in Thailand, mark stage 2 (intl → TH) DELIVERED for all items in that lot.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../packages/database/src";

type Db = Prisma.TransactionClient | typeof prisma;

const STAGE_INTL_THAILAND_CODE = "STAGE_2_INTL_THAILAND";

let cachedStage2Id: number | null = null;

async function getIntlThailandStageTypeId(db: Db): Promise<number> {
  if (cachedStage2Id != null && db === prisma) return cachedStage2Id;
  const row = await db.deliveryStageType.findUnique({
    where: { code: STAGE_INTL_THAILAND_CODE },
    select: { id: true },
  });
  if (!row)
    throw new Error(`delivery_stage_types missing ${STAGE_INTL_THAILAND_CODE}`);
  if (db === prisma) cachedStage2Id = row.id;
  return row.id;
}

/**
 * Set STAGE_2_INTL_THAILAND to DELIVERED for every auction_request assigned to this lot.
 */
export async function markIntlThailandStageDeliveredForLot(
  lotId: number,
  tx?: Db,
): Promise<void> {
  const db = tx ?? prisma;
  const stageTypeId = await getIntlThailandStageTypeId(db);
  const now = new Date();
  await db.deliveryStage.updateMany({
    where: {
      stage_type_id: stageTypeId,
      auction_request: { lot_id: lotId },
    },
    data: {
      status: "DELIVERED",
      delivered_at: now,
    },
  });
}
