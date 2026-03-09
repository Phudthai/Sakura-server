/**
 * @file staff.controller.ts
 * @description Backoffice staff management
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'
import { createStaffSchema, updateStaffSchema } from '../../../packages/shared/src'

export async function listStaffs(_req: Request, res: Response) {
  const staffs = await prisma.staff.findMany({ orderBy: { name: 'asc' } })

  return res.json({
    success: true,
    data: staffs.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

export async function createStaff(req: Request, res: Response) {
  const result = createStaffSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const staff = await prisma.staff.create({ data: { name: result.data.name } })

  return res.status(201).json({
    success: true,
    data: { id: staff.id, name: staff.name, createdAt: staff.createdAt.toISOString() },
    message: `Staff "${staff.name}" created`,
  })
}

export async function updateStaff(req: Request, res: Response) {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } })
  }

  const result = updateStaffSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
  }

  const existing = await prisma.staff.findUnique({ where: { id } })
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Staff not found' } })
  }

  const updated = await prisma.staff.update({ where: { id }, data: { name: result.data.name } })

  return res.json({
    success: true,
    data: { id: updated.id, name: updated.name, createdAt: updated.createdAt.toISOString() },
    message: 'Staff updated',
  })
}
