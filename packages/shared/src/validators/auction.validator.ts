/**
 * @file auction.validator.ts
 * @description Auction request validation schemas
 * @module @sakura/shared/validators
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import { z } from "zod";

export const createAuctionRequestSchema = z.object({
  url: z
    .string()
    .url("Invalid URL format")
    .refine((u) => new URL(u).hostname.includes("auctions.yahoo.co.jp"), {
      message:
        "รองรับเฉพาะ Yahoo Auctions Japan (auctions.yahoo.co.jp) เท่านั้น",
    }),
  firstBidPrice: z.number().int().positive().optional(),
  intl_shipping_type: z.enum(["air", "sea"]),
});

/** Backoffice: same as create — creates new user (user_code auto-generated) for first-time customers */
export const createAuctionBackofficeSchema = createAuctionRequestSchema;

export const updateAuctionStatusSchema = z.object({
  status: z.enum(["tracking", "closed", "cancelled"]),
});

export const updateAuctionNoteSchema = z.object({
  note: z.string().max(2000).nullable(),
});

export const updateAuctionWeightGramSchema = z.object({
  weight_gram: z.number().int().positive("weight_gram must be positive"),
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

export const mockAuctionSchema = z.object({
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
});

export const updateLotSchema = z.object({
  lot_code: z.string().min(1).max(50).optional(),
  intl_shipping_type: z.enum(["air", "sea"]).optional(),
  start_lot_at: z.coerce.date().nullable().optional(),
  end_lot_at: z.coerce.date().nullable().optional(),
  arrive_at: z.coerce.date().nullable().optional(),
});

export const assignLotToAuctionSchema = z.object({
  lot_id: z.number().int().positive().nullable(),
});

export type CreateAuctionRequestInput = z.infer<
  typeof createAuctionRequestSchema
>;
export type CreateAuctionBackofficeInput = z.infer<
  typeof createAuctionBackofficeSchema
>;
export type UpdateAuctionStatusInput = z.infer<
  typeof updateAuctionStatusSchema
>;
export type UpdateAuctionNoteInput = z.infer<typeof updateAuctionNoteSchema>;
export type UpdateAuctionWeightGramInput = z.infer<typeof updateAuctionWeightGramSchema>;
export type ApproveBidInput = z.infer<typeof approveBidSchema>;
export type RejectBidInput = z.infer<typeof rejectBidSchema>;
export type SubmitBidInput = z.infer<typeof submitBidSchema>;
export type MockAuctionInput = z.infer<typeof mockAuctionSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type CreateLotInput = z.infer<typeof createLotSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export type AssignLotToAuctionInput = z.infer<typeof assignLotToAuctionSchema>;
