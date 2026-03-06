/**
 * @file api.types.ts
 * @description Common API response types
 * @module @sakura/shared/types
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

/**
 * Standard API success response
 *
 * @template T - Type of data payload
 *
 * @example
 * ```typescript
 * const response: ApiResponse<User> = {
 *   success: true,
 *   data: { id: '123', email: 'user@example.com', ... },
 *   message: 'User fetched successfully'
 * }
 * ```
 */
export interface ApiResponse<T = unknown> {
  /** Success status */
  success: true

  /** Response data payload */
  data: T

  /** Optional success message */
  message?: string

  /** Response metadata (pagination, etc.) */
  meta?: Record<string, unknown>
}

/**
 * Standard API error response
 *
 * @example
 * ```typescript
 * const error: ApiError = {
 *   success: false,
 *   error: {
 *     code: 'VALIDATION_ERROR',
 *     message: 'Invalid email format',
 *     details: { field: 'email', value: 'invalid' }
 *   }
 * }
 * ```
 */
export interface ApiError {
  /** Success status (always false for errors) */
  success: false

  /** Error details */
  error: {
    /** Error code for programmatic handling */
    code: string

    /** Human-readable error message */
    message: string

    /** Additional error details */
    details?: Record<string, unknown>

    /** Stack trace (development only) */
    stack?: string
  }
}

/**
 * Pagination metadata
 *
 * @description
 * Standard pagination structure for list endpoints
 *
 * @example
 * ```typescript
 * const meta: PaginationMeta = {
 *   page: 1,
 *   limit: 20,
 *   total: 100,
 *   totalPages: 5,
 *   hasNextPage: true,
 *   hasPrevPage: false
 * }
 * ```
 */
export interface PaginationMeta {
  /** Current page number (1-indexed) */
  page: number

  /** Number of items per page */
  limit: number

  /** Total number of items */
  total: number

  /** Total number of pages */
  totalPages: number

  /** Whether there is a next page */
  hasNextPage: boolean

  /** Whether there is a previous page */
  hasPrevPage: boolean

  /** Allow extra metadata */
  [key: string]: unknown
}

/**
 * Paginated API response
 *
 * @template T - Type of items in the list
 *
 * @example
 * ```typescript
 * const response: PaginatedResponse<Order> = {
 *   success: true,
 *   data: [order1, order2, order3],
 *   meta: {
 *     page: 1,
 *     limit: 20,
 *     total: 100,
 *     totalPages: 5,
 *     hasNextPage: true,
 *     hasPrevPage: false
 *   }
 * }
 * ```
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta
}
