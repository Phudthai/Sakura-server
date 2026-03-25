/**
 * @file shipping-address.validator.ts
 * @description Enduser shipping address (Thai-style) — Zod schemas
 */

import { z } from 'zod'

const addressFields = {
  label: z.string().max(100).optional(),
  recipientName: z.string().min(1, 'Recipient name is required').max(200),
  phone: z.string().max(30).optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required').max(500),
  addressLine2: z.string().max(500).optional(),
  subdistrict: z.string().min(1, 'Subdistrict is required').max(200),
  district: z.string().min(1, 'District is required').max(200),
  province: z.string().min(1, 'Province is required').max(200),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  country: z.string().max(10).optional(),
  isDefault: z.boolean().optional(),
}

export const createShippingAddressSchema = z.object(addressFields)

export const updateShippingAddressSchema = z.object({
  label: z.string().max(100).optional(),
  recipientName: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  addressLine1: z.string().min(1).max(500).optional(),
  addressLine2: z.string().max(500).optional(),
  subdistrict: z.string().min(1).max(200).optional(),
  district: z.string().min(1).max(200).optional(),
  province: z.string().min(1).max(200).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  country: z.string().max(10).optional(),
  isDefault: z.boolean().optional(),
})

export type CreateShippingAddressInput = z.infer<typeof createShippingAddressSchema>
export type UpdateShippingAddressInput = z.infer<typeof updateShippingAddressSchema>
