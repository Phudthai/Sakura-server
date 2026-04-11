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

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const usernameOpt = z.string().min(1).max(200).optional();

/** Backoffice: POST /api/backoffice/purchase-requests — discriminated by purchase_mode (+ buyout_source for BUYOUT). */
export const createPurchaseRequestBackofficeAuctionSchema = z
  .object({
    purchase_mode: z.literal("AUCTION"),
    auction_source: z.enum(["yahoo", "mercari"]),
    url: z.string().url("Invalid URL format"),
    intl_shipping_type: z.enum(["air", "sea"]),
    username: usernameOpt,
    paid: z.number().int().positive().optional(),
    first_bid_price: z.number().int().positive().optional(),
    /** Required for mercari until Mercari API/scrape exists — used as listing price when scraping is unavailable. */
    item_price_jpy: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const h = hostOf(data.url);
    if (!h) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid URL format",
        path: ["url"],
      });
      return;
    }
    if (data.auction_source === "yahoo") {
      if (!h.includes("auctions.yahoo.co.jp")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "auction_source yahoo requires Yahoo Auctions Japan URL (auctions.yahoo.co.jp)",
          path: ["url"],
        });
      }
    } else if (data.auction_source === "mercari") {
      if (!h.includes("mercari.com")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "auction_source mercari requires a mercari.com item URL",
          path: ["url"],
        });
      }
    }
    const hasPaid = data.paid != null;
    const hasFirst = data.first_bid_price != null;
    if (hasPaid && hasFirst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot send paid and first_bid_price together",
        path: ["paid"],
      });
    }
    if (!hasPaid && !hasFirst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send either paid (instant purchase) or first_bid_price (open auction)",
        path: ["first_bid_price"],
      });
    }
    if (data.auction_source === "mercari" && data.item_price_jpy == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "item_price_jpy is required for mercari until automated pricing is available",
        path: ["item_price_jpy"],
      });
    }
  });

export const createPurchaseRequestBackofficeBuyoutMarketplaceSchema = z
  .object({
    purchase_mode: z.literal("BUYOUT"),
    buyout_source: z.enum(["yahoo", "mercari"]),
    url: z.string().url("Invalid URL format"),
    intl_shipping_type: z.enum(["air", "sea"]),
    username: usernameOpt,
    paid: z.number().int().positive().optional(),
    client_entry: z.enum(["first_buyout", "not_arrived_japan"]),
    item_price_jpy: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const h = hostOf(data.url);
    if (!h) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid URL format",
        path: ["url"],
      });
      return;
    }
    if (data.buyout_source === "yahoo") {
      if (!h.includes("yahoo.co.jp") && !h.includes("auctions.yahoo.co.jp")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "buyout_source yahoo requires a Yahoo Japan URL",
          path: ["url"],
        });
      }
    } else if (data.buyout_source === "mercari") {
      if (!h.includes("mercari.com")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "buyout_source mercari requires a mercari.com URL",
          path: ["url"],
        });
      }
      if (data.item_price_jpy == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "item_price_jpy is required for mercari until automated pricing is available",
          path: ["item_price_jpy"],
        });
      }
    }
  });

export const createPurchaseRequestBackofficeBuyoutGeneralWebSchema = z
  .object({
    purchase_mode: z.literal("BUYOUT"),
    buyout_source: z.literal("general_web"),
    url: z.string().url("Invalid URL format"),
    intl_shipping_type: z.enum(["air", "sea"]),
    username: usernameOpt,
    product_title: z.string().min(1).max(2000),
    site_name: z.string().min(1).max(500),
    /** Product price in JPY (manual). */
    first_bid_price: z.number().int().positive(),
    paid: z.number().int().positive().optional(),
    client_entry: z.enum(["first_buyout", "not_arrived_japan"]),
  })
  .superRefine((_data, _ctx) => {
    /* general_web: any valid http(s) url — no extra host rules */
  });

export const createPurchaseRequestBackofficeSchema = z.union([
  createPurchaseRequestBackofficeAuctionSchema,
  createPurchaseRequestBackofficeBuyoutMarketplaceSchema,
  createPurchaseRequestBackofficeBuyoutGeneralWebSchema,
]);

export const updatePurchaseRequestStatusSchema = z.object({
  status: z.enum(["tracking", "closed", "cancelled"]),
});

export const updatePurchaseRequestNoteSchema = z.object({
  note: z.string().max(2000).nullable(),
});

export const updatePurchaseRequestWeightGramSchema = z.object({
  weight_gram: z.number().int().positive("weight_gram must be positive"),
});

/** Backoffice: change air/sea only while weight_gram is still unset */
export const updatePurchaseRequestIntlShippingTypeSchema = z.object({
  intl_shipping_type: z.enum(["air", "sea"]),
});

export const updateDomesticShippingSchema = z.object({
  amount_baht: z.number().positive("amount_baht must be positive"),
});

export const approveBidSchema = z.object({
  biddedBy: z.number().int().positive("Actor user ID is required"),
});

export const rejectBidSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(500),
});

export const submitBidSchema = z.object({
  price: z.number().int().positive("ราคา bid ต้องเป็นตัวเลขบวก"),
});

export const submitBidBackofficeSchema = submitBidSchema.extend({
  biddedBy: z.number().int().positive("Actor user ID is required"),
});

export const mockPurchaseRequestSchema = z.object({
  action: z.enum(["outbid", "end-time"]),
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
export type UpdatePurchaseRequestIntlShippingTypeInput = z.infer<
  typeof updatePurchaseRequestIntlShippingTypeSchema
>;
export type ApproveBidInput = z.infer<typeof approveBidSchema>;
export type RejectBidInput = z.infer<typeof rejectBidSchema>;
export type SubmitBidInput = z.infer<typeof submitBidSchema>;
export type MockPurchaseRequestInput = z.infer<
  typeof mockPurchaseRequestSchema
>;
export type CreateLotInput = z.infer<typeof createLotSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export type AssignLotToPurchaseRequestInput = z.infer<
  typeof assignLotToPurchaseRequestSchema
>;
