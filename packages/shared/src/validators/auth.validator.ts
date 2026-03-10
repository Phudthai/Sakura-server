/**
 * @file auth.validator.ts
 * @description Authentication validation schemas using Zod
 * @module @sakura/shared/validators
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

import { z } from 'zod'

/**
 * User registration validation schema
 *
 * @description
 * Validates user registration input with the following rules:
 * - Email: Valid email format, lowercase, max 255 chars
 * - Name: Min 2 chars, max 100 chars
 *
 * @example
 * ```typescript
 * const result = registerSchema.safeParse(input)
 * if (!result.success) {
 *   console.error(result.error.issues)
 * }
 * ```
 */
export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email too long'),

  password: z.string({ required_error: 'Password is required' }),

  name: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Zก-๙\s]+$/, 'Name can only contain letters'),

  phone: z.string().optional(),

  /** Maps to username in DB (optional display name; user_code is auto-generated) */
  username: z.string().max(100).optional(),

  /** Maps to external_id in DB */
  userId: z.string().max(255).optional(),

  /** For completing registration of placeholder user (from backoffice register_url) */
  user_code: z.string().max(100).optional(),
})

/**
 * Type inference from registration schema
 */
export type RegisterInput = z.infer<typeof registerSchema>

/**
 * User login validation schema
 *
 * @description
 * Validates user login credentials
 *
 * @example
 * ```typescript
 * const result = loginSchema.parse({
 *   email: 'user@example.com',
 *   password: 'SecurePass123!'
 * })
 * ```
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase(),

  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
})

/**
 * Type inference from login schema
 */
export type LoginInput = z.infer<typeof loginSchema>

/**
 * Password reset request schema
 */
export const resetPasswordRequestSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase(),
})

/**
 * Type inference from reset password request schema
 */
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>

/**
 * Password reset confirmation schema
 */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
        'Password must contain uppercase, lowercase, number, and special character'
      ),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

/**
 * Type inference from reset password schema
 */
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
