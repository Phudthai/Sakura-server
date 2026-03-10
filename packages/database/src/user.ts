/**
 * @file user.ts
 * @description User-related helpers for @sakura/database
 * @module @sakura/database
 *
 * @description
 * Utilities for user operations, including auto-generation of user_code.
 */

import type { PrismaClient } from '@prisma/client'

/**
 * Generates the next sequential user_code (m000001, m000002, ...).
 *
 * @param prisma - Prisma client instance (supports transactions)
 * @returns The next available user_code string
 *
 * @example
 * ```typescript
 * const userCode = await generateUserCode(prisma)
 * await prisma.user.create({ data: { userCode, email, ... } })
 * ```
 */
export async function generateUserCode(
  prisma: Pick<PrismaClient, 'user'>
): Promise<string> {
  const last = await prisma.user.findFirst({
    orderBy: { id: 'desc' },
    select: { userCode: true },
  })
  const num = last ? parseInt(last.userCode.replace(/^m/, ''), 10) + 1 : 1
  return `m${String(num).padStart(6, '0')}`
}
