/**
 * @file customer.controller.ts
 * @description Backoffice customer (CUSTOMER role users) management
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'

export async function listCustomers(_req: Request, res: Response) {
  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      user_code: true,
      username: true,
      email: true,
      name: true,
      phone: true,
      is_active: true,
      is_email_verified: true,
      created_at: true,
    },
  })
  return res.json({
    success: true,
    data: customers.map((c) => ({
      id: c.id,
      userCode: c.user_code,
      username: c.username ?? null,
      email: c.email ?? null,
      name: c.name ?? null,
      phone: c.phone ?? null,
      isActive: c.is_active,
      isEmailVerified: c.is_email_verified,
      createdAt: c.created_at.toISOString(),
    })),
  })
}
