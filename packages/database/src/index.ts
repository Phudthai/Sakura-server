/**
 * @file index.ts
 * @description Main export for @sakura/database package
 * @module @sakura/database
 *
 * @description
 * Exports Prisma Client instance and all generated types.
 * Single source of truth for database access across monorepo.
 *
 * @example
 * ```typescript
 * // Import Prisma client
 * import { prisma } from '@sakura/database'
 *
 * // Import types
 * import type { User, Order, Payment } from '@sakura/database'
 *
 * // Use in your code
 * const users: User[] = await prisma.user.findMany()
 * ```
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

// Export Prisma Client instance
export { prisma } from './client'

// Re-export all Prisma generated types for type safety
export * from '@prisma/client'
