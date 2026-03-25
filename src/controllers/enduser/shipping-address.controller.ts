/**
 * @file shipping-address.controller.ts
 * @description Enduser CRUD for shipping addresses (1 user → many)
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import {
  createShippingAddressSchema,
  updateShippingAddressSchema,
} from '../../../packages/shared/src'

function mapAddress(a: {
  id: number
  label: string | null
  recipient_name: string
  phone: string | null
  address_line1: string
  address_line2: string | null
  subdistrict: string
  district: string
  province: string
  postal_code: string
  country: string
  is_default: boolean
  created_at: Date
  updated_at: Date
}) {
  return {
    id: a.id,
    label: a.label,
    recipientName: a.recipient_name,
    phone: a.phone,
    addressLine1: a.address_line1,
    addressLine2: a.address_line2,
    subdistrict: a.subdistrict,
    district: a.district,
    province: a.province,
    postalCode: a.postal_code,
    country: a.country,
    isDefault: a.is_default,
    createdAt: a.created_at.toISOString(),
    updatedAt: a.updated_at.toISOString(),
  }
}

export async function listShippingAddresses(req: Request, res: Response) {
  try {
    const userId = req.user!.userId
    const rows = await prisma.userShippingAddress.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: 'desc' }, { id: 'asc' }],
    })
    return res.json({
      success: true,
      data: rows.map(mapAddress),
    })
  } catch (error) {
    console.error('[listShippingAddresses]', error)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    })
  }
}

export async function createShippingAddress(req: Request, res: Response) {
  try {
    const userId = req.user!.userId
    const result = createShippingAddressSchema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } },
      })
    }

    const d = result.data
    const country = (d.country ?? 'TH').trim() || 'TH'

    const row = await prisma.$transaction(async (tx) => {
      const count = await tx.userShippingAddress.count({ where: { user_id: userId } })
      const makeDefault = d.isDefault === true || count === 0
      if (makeDefault) {
        await tx.userShippingAddress.updateMany({
          where: { user_id: userId },
          data: { is_default: false },
        })
      }
      return tx.userShippingAddress.create({
        data: {
          user_id: userId,
          label: d.label?.trim() || null,
          recipient_name: d.recipientName.trim(),
          phone: d.phone?.trim() || null,
          address_line1: d.addressLine1.trim(),
          address_line2: d.addressLine2?.trim() || null,
          subdistrict: d.subdistrict.trim(),
          district: d.district.trim(),
          province: d.province.trim(),
          postal_code: d.postalCode.trim(),
          country,
          is_default: makeDefault,
        },
      })
    })

    return res.status(201).json({
      success: true,
      data: mapAddress(row),
      message: 'Shipping address created',
    })
  } catch (error) {
    console.error('[createShippingAddress]', error)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    })
  }
}

export async function updateShippingAddress(req: Request, res: Response) {
  try {
    const userId = req.user!.userId
    const id = parseInt(req.params.id, 10)
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid address id' },
      })
    }

    const result = updateShippingAddressSchema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } },
      })
    }

    const payload = result.data
    const hasAny = Object.values(payload).some((v) => v !== undefined)
    if (!hasAny) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one field is required' },
      })
    }

    const existing = await prisma.userShippingAddress.findFirst({
      where: { id, user_id: userId },
    })
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Shipping address not found' },
      })
    }

    const row = await prisma.$transaction(async (tx) => {
      if (payload.isDefault === true) {
        await tx.userShippingAddress.updateMany({
          where: { user_id: userId },
          data: { is_default: false },
        })
      }

      return tx.userShippingAddress.update({
        where: { id },
        data: {
          ...(payload.label !== undefined ? { label: payload.label?.trim() || null } : {}),
          ...(payload.recipientName !== undefined ? { recipient_name: payload.recipientName.trim() } : {}),
          ...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
          ...(payload.addressLine1 !== undefined ? { address_line1: payload.addressLine1.trim() } : {}),
          ...(payload.addressLine2 !== undefined ? { address_line2: payload.addressLine2?.trim() || null } : {}),
          ...(payload.subdistrict !== undefined ? { subdistrict: payload.subdistrict.trim() } : {}),
          ...(payload.district !== undefined ? { district: payload.district.trim() } : {}),
          ...(payload.province !== undefined ? { province: payload.province.trim() } : {}),
          ...(payload.postalCode !== undefined ? { postal_code: payload.postalCode.trim() } : {}),
          ...(payload.country !== undefined
            ? { country: (payload.country ?? 'TH').trim() || 'TH' }
            : {}),
          ...(payload.isDefault !== undefined ? { is_default: payload.isDefault } : {}),
        },
      })
    })

    return res.json({
      success: true,
      data: mapAddress(row),
      message: 'Shipping address updated',
    })
  } catch (error) {
    console.error('[updateShippingAddress]', error)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    })
  }
}

export async function deleteShippingAddress(req: Request, res: Response) {
  try {
    const userId = req.user!.userId
    const id = parseInt(req.params.id, 10)
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid address id' },
      })
    }

    const existing = await prisma.userShippingAddress.findFirst({
      where: { id, user_id: userId },
    })
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Shipping address not found' },
      })
    }

    await prisma.$transaction(async (tx) => {
      const wasDefault = existing.is_default
      await tx.userShippingAddress.delete({ where: { id } })
      if (wasDefault) {
        const next = await tx.userShippingAddress.findFirst({
          where: { user_id: userId },
          orderBy: { id: 'asc' },
        })
        if (next) {
          await tx.userShippingAddress.update({
            where: { id: next.id },
            data: { is_default: true },
          })
        }
      }
    })

    return res.json({
      success: true,
      message: 'Shipping address deleted',
    })
  } catch (error) {
    console.error('[deleteShippingAddress]', error)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    })
  }
}
