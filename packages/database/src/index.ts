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

// Export user helpers
export { generateUserCode } from './user'

// Re-export from root-generated client (same reason as client.ts — avoid nested stale @prisma/client)
export * from '../../../node_modules/.prisma/client'
