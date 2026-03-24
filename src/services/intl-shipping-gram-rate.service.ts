/**
 * Intl shipping: THB per gram (was hardcoded air 0.59 / sea 0.35).
 * Loaded from `intl_shipping_gram_rates`, cached like JPY tiers.
 */

import { prisma } from "../../packages/database/src";

const FALLBACK_AIR = 0.59;
const FALLBACK_SEA = 0.35;

let cachedAir = FALLBACK_AIR;
let cachedSea = FALLBACK_SEA;

export async function reloadIntlShippingGramRates(): Promise<void> {
  const rows = await prisma.intlShippingGramRate.findMany();
  let air = FALLBACK_AIR;
  let sea = FALLBACK_SEA;
  for (const r of rows) {
    const v = Number(r.baht_per_gram);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (r.intl_shipping_type === "sea") sea = v;
    else if (r.intl_shipping_type === "air") air = v;
  }
  cachedAir = air;
  cachedSea = sea;
}

/** บาทต่อกรัมสำหรับค่าขนส่งระหว่างประเทศ — default air ถ้าไม่ใช่ sea */
export function getBahtPerGram(intlShippingType: string | null | undefined): number {
  return intlShippingType === "sea" ? cachedSea : cachedAir;
}
