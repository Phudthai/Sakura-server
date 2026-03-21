/**
 * @file exchange-rate.validator.ts
 * @description Zod + partition rules for JPY→THB tier config
 */

import { z } from 'zod'

export const jpyThbTierInputSchema = z.object({
  minJpy: z.number().int().min(0),
  maxJpy: z.number().int().nullable(),
  rate: z.number().positive(),
  sortOrder: z.number().int(),
})

export const putJpyThbTiersBodySchema = z.object({
  tiers: z.array(jpyThbTierInputSchema).min(1),
})

export type JpyThbTierInput = z.infer<typeof jpyThbTierInputSchema>
export type PutJpyThbTiersBody = z.infer<typeof putJpyThbTiersBodySchema>

/**
 * Validates contiguous half-open partition [0, ∞): first min=0, only last max=null, each max=next min.
 */
export function validateJpyThbTiersPartition(tiers: JpyThbTierInput[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder)
  if (sorted[0].minJpy !== 0) {
    return 'First tier must have minJpy 0'
  }
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    if (t.maxJpy != null && t.maxJpy <= t.minJpy) {
      return 'Each tier must have maxJpy > minJpy (or null for the last tier)'
    }
    if (i < sorted.length - 1) {
      if (t.maxJpy == null) {
        return 'Only the last tier may have null maxJpy'
      }
      if (t.maxJpy !== sorted[i + 1].minJpy) {
        return `Tiers must be contiguous: tier ending at maxJpy ${t.maxJpy} must match next minJpy ${sorted[i + 1].minJpy}`
      }
    } else {
      if (t.maxJpy != null) {
        return 'Last tier must have maxJpy null (open-ended)'
      }
    }
  }
  return null
}
