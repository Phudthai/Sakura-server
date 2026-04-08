/**
 * @file purchase-request.validator.ts
 * @description Purchase request validation schemas
 * @module @sakura/shared/validators
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import { z } from "zod";

const createPurchaseRequestFields = {
  url: z.string().url("Invalid URL format"),
  firstBidPrice: z.number().int().positive().optional(),
  intl_shipping_type: z.enum(["air", "sea"]),
  /** When BUYOUT and scrape fails or omits price — optional manual JPY price */
  fixed_price_jpy: z.number().int().positive().optional(),
};

function refineCreatePurchaseRequestUrl(
  data: {
    url: string;
    purchase_mode: "AUCTION" | "BUYOUT";
  },
  ctx: z.RefinementCtx,
) {
  let host: string;
  try {
    host = new URL(data.url).hostname;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid URL format",
      path: ["url"],
    });
    return;
  }
  if (data.purchase_mode === "AUCTION") {
    if (!host.includes("auctions.yahoo.co.jp")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "รองรับเฉพาะ Yahoo Auctions Japan (auctions.yahoo.co.jp) เท่านั้น",
        path: ["url"],
      });
    }
  } else {
    if (!host.includes("yahoo.co.jp")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "รองรับเฉพาะโดเมน Yahoo Japan (yahoo.co.jp) เท่านั้น",
        path: ["url"],
      });
    }
  }
}

/** Enduser + Backoffice: purchase_mode required */
export const createPurchaseRequestSchema = z
  .object({
    ...createPurchaseRequestFields,
    purchase_mode: z.enum(["AUCTION", "BUYOUT"]),
  })
  .superRefine(refineCreatePurchaseRequestUrl);

export const createPurchaseRequestBackofficeSchema =
  createPurchaseRequestSchema;

export const updatePurchaseRequestStatusSchema = z.object({
  status: z.enum(["tracking", "closed", "cancelled"]),
});

export const updatePurchaseRequestNoteSchema = z.object({
  note: z.string().max(2000).nullable(),
});

export const updatePurchaseRequestWeightGramSchema = z.object({
  weight_gram: z.number().int().positive("weight_gram must be positive"),
});

export const updateDomesticShippingSchema = z.object({
  amount_baht: z.number().positive("amount_baht must be positive"),
});

export const approveBidSchema = z.object({
  biddedBy: z.number().int().positive("Staff ID is required"),
});

export const rejectBidSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(500),
});

export const submitBidSchema = z.object({
  price: z.number().int().positive("ราคา bid ต้องเป็นตัวเลขบวก"),
});

export const submitBidBackofficeSchema = submitBidSchema.extend({
  biddedBy: z.number().int().positive("Staff ID is required"),
});

export const mockPurchaseRequestSchema = z.object({
  action: z.enum(["outbid", "end-time"]),
});

export const createStaffSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

export const createLotSchema = z.object({
  lot_code: z.string().min(1, "lot_code is required").max(50),
  intl_shipping_type: z.enum(["air", "sea"]),
  start_lot_at: z.coerce.date().nullable().optional(),
  end_lot_at: z.coerce.date().nullable().optional(),
  arrive_at: z.coerce.date().nullable().optional(),
  /** Confirms lot actually arrived in Thailand (independent of planned arrive_at). */
  is_arrived: z.boolean().optional(),
  /** Manual flag for end-user lot label (ล่าช้า** prefix). */
  is_delayed: z.boolean().optional(),
});

export const updateLotSchema = z.object({
  lot_code: z.string().min(1).max(50).optional(),
  intl_shipping_type: z.enum(["air", "sea"]).optional(),
  start_lot_at: z.coerce.date().nullable().optional(),
  end_lot_at: z.coerce.date().nullable().optional(),
  arrive_at: z.coerce.date().nullable().optional(),
  is_arrived: z.boolean().optional(),
  is_delayed: z.boolean().optional(),
});

export const assignLotToPurchaseRequestSchema = z.object({
  lot_id: z.number().int().positive().nullable(),
});

export type CreatePurchaseRequestInput = z.infer<
  typeof createPurchaseRequestSchema
>;
export type CreatePurchaseRequestBackofficeInput = z.infer<
  typeof createPurchaseRequestBackofficeSchema
>;
export type UpdatePurchaseRequestStatusInput = z.infer<
  typeof updatePurchaseRequestStatusSchema
>;
export type UpdatePurchaseRequestNoteInput = z.infer<
  typeof updatePurchaseRequestNoteSchema
>;
export type UpdatePurchaseRequestWeightGramInput = z.infer<
  typeof updatePurchaseRequestWeightGramSchema
>;
export type ApproveBidInput = z.infer<typeof approveBidSchema>;
export type RejectBidInput = z.infer<typeof rejectBidSchema>;
export type SubmitBidInput = z.infer<typeof submitBidSchema>;
export type MockPurchaseRequestInput = z.infer<
  typeof mockPurchaseRequestSchema
>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type CreateLotInput = z.infer<typeof createLotSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export type AssignLotToPurchaseRequestInput = z.infer<
  typeof assignLotToPurchaseRequestSchema
>;
