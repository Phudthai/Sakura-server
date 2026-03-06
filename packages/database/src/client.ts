/**
 * @file client.ts
 * @description Prisma Client singleton instance
 * @module @sakura/database
 *
 * @description
 * Provides a single Prisma Client instance across the application.
 * Prevents creating multiple instances which can exhaust database connections.
 *
 * @best-practice
 * - Singleton pattern for Node.js applications
 * - Proper handling of development hot reloads
 * - Connection pooling configured via DATABASE_URL
 *
 * @example
 * ```typescript
 * import { prisma } from '@sakura/database'
 *
 * const users = await prisma.user.findMany()
 * ```
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

import { PrismaClient } from '@prisma/client'

/**
 * Global type declaration for Prisma Client
 * Allows storing Prisma instance globally in development
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

/**
 * Prisma Client instance with custom configuration
 *
 * @configuration
 * - log: Query logging based on environment
 * - errorFormat: Detailed errors in development, minimal in production
 *
 * @logging
 * Development: Log all queries, errors, and warnings
 * Production: Log errors only
 */
export const prisma =
  global.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  })

/**
 * Store Prisma instance globally in development
 *
 * @description
 * In development, hot reloading can create multiple Prisma instances.
 * Storing globally prevents connection pool exhaustion.
 *
 * @see https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 */
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

/**
 * Graceful shutdown handler
 *
 * @description
 * Ensures database connections are properly closed on application shutdown.
 * Prevents connection leaks and database lock issues.
 *
 * @events
 * - SIGINT: Ctrl+C in terminal
 * - SIGTERM: Kill command or Docker stop
 */
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
