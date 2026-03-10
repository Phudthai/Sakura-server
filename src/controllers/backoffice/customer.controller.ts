/**
 * @file customer.controller.ts
 * @description Backoffice customer (CUSTOMER role users) management
 */

import { Request, Response } from 'express'
import { prisma } from '../../../packages/database/src'

export async function listCustomers(_req: Request, res: Response) {
  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userCode: true,
      username: true,
      email: true,
      name: true,
      phone: true,
      isActive: true,
      isEmailVerified: true,
      createdAt: true,
    },
  })
  return res.json({
    success: true,
    data: customers.map((c) => ({
      id: c.id,
      userCode: c.userCode,
      username: c.username ?? null,
      email: c.email ?? null,
      name: c.name ?? null,
      phone: c.phone ?? null,
      isActive: c.isActive,
      isEmailVerified: c.isEmailVerified,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}
