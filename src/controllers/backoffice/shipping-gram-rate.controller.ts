/**
 * Backoffice: THB per gram for intl shipping (air / sea)
 */

import { Request, Response } from "express";
import { prisma } from "../../../packages/database/src";
import { putShippingGramRatesBodySchema } from "../../../packages/shared/src";
import { reloadIntlShippingGramRates } from "../../services/intl-shipping-gram-rate.service";

export async function getShippingGramRates(_req: Request, res: Response) {
  const rows = await prisma.intlShippingGramRate.findMany({
    orderBy: { intl_shipping_type: "asc" },
  });
  const air = rows.find((r) => r.intl_shipping_type === "air");
  const sea = rows.find((r) => r.intl_shipping_type === "sea");
  return res.json({
    success: true,
    data: {
      air: { bahtPerGram: air ? Number(air.baht_per_gram) : 0.59 },
      sea: { bahtPerGram: sea ? Number(sea.baht_per_gram) : 0.35 },
    },
  });
}

export async function putShippingGramRates(req: Request, res: Response) {
  const parsed = putShippingGramRatesBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: errors },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.intlShippingGramRate.upsert({
      where: { intl_shipping_type: "air" },
      create: {
        intl_shipping_type: "air",
        baht_per_gram: parsed.data.air.bahtPerGram,
      },
      update: { baht_per_gram: parsed.data.air.bahtPerGram },
    });
    await tx.intlShippingGramRate.upsert({
      where: { intl_shipping_type: "sea" },
      create: {
        intl_shipping_type: "sea",
        baht_per_gram: parsed.data.sea.bahtPerGram,
      },
      update: { baht_per_gram: parsed.data.sea.bahtPerGram },
    });
  });

  await reloadIntlShippingGramRates();

  const rows = await prisma.intlShippingGramRate.findMany({
    orderBy: { intl_shipping_type: "asc" },
  });
  const air = rows.find((r) => r.intl_shipping_type === "air");
  const sea = rows.find((r) => r.intl_shipping_type === "sea");

  return res.json({
    success: true,
    data: {
      air: { bahtPerGram: air ? Number(air.baht_per_gram) : parsed.data.air.bahtPerGram },
      sea: { bahtPerGram: sea ? Number(sea.baht_per_gram) : parsed.data.sea.bahtPerGram },
    },
    message: "Intl shipping gram rates updated",
  });
}
