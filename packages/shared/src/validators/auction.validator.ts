/**
 * @file auction.validator.ts
 * @description Auction request validation schemas
 * @module @sakura/shared/validators
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import { z } from 'zod'

export const createAuctionRequestSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .refine((u) => new URL(u).hostname.includes('auctions.yahoo.co.jp'), {
      message: 'รองรับเฉพาะ Yahoo Auctions Japan (auctions.yahoo.co.jp) เท่านั้น',
    }),
  firstBidPrice: z.number().int().positive().optional(),
})

export const updateAuctionStatusSchema = z.object({
  status: z.enum(['tracking', 'closed', 'cancelled']),
})

export const updateAuctionNoteSchema = z.object({
  note: z.string().max(2000).nullable(),
})

export const approveBidSchema = z.object({
  biddedBy: z.number().int().positive('Staff ID is required'),
})

export const rejectBidSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
})

export const submitBidSchema = z.object({
  price: z.number().int().positive('ราคา bid ต้องเป็นตัวเลขบวก'),
})

export const mockAuctionSchema = z.object({
  action: z.enum(['outbid', 'end-time']),
})

export const createStaffSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
})

export const updateStaffSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
})

export type CreateAuctionRequestInput = z.infer<typeof createAuctionRequestSchema>
export type UpdateAuctionStatusInput = z.infer<typeof updateAuctionStatusSchema>
export type UpdateAuctionNoteInput = z.infer<typeof updateAuctionNoteSchema>
export type ApproveBidInput = z.infer<typeof approveBidSchema>
export type RejectBidInput = z.infer<typeof rejectBidSchema>
export type SubmitBidInput = z.infer<typeof submitBidSchema>
export type MockAuctionInput = z.infer<typeof mockAuctionSchema>
export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
