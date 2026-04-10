/**
 * @file auth.controller.ts
 * @description Backoffice authentication — ADMIN/STAFF only
 */

import { Request, Response } from 'express'
import { compare, hash } from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma, generateUserCode } from '../../../packages/database/src'
import {
  createBackofficeStaffUserSchema,
  loginSchema,
} from '../../../packages/shared/src'

const JWT_SECRET = process.env.JWT_SECRET ?? 'sakura-dev-secret-change-in-production'
const JWT_EXPIRES_IN = '7d'

function signToken(payload: { userId: number; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export async function loginBackoffice(req: Request, res: Response) {
  try {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
    }

    const { email, password } = result.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } })
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'This account has been deactivated' } })
    }

    if (user.role === 'CUSTOMER') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Backoffice access requires ADMIN or STAFF role' },
      })
    }

    if (!user.password) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } })
    }
    const isValid = await compare(password, user.password)
    if (!isValid) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } })
    }

    const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email ?? null,
          name: user.name ?? null,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.is_email_verified,
          createdAt: user.created_at,
        },
      },
      message: 'Logged in successfully',
    })
  } catch (error) {
    console.error('[Backoffice Login Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}

/**
 * ADMIN only — create STAFF user for backoffice login (email verified + active).
 */
export async function createBackofficeStaff(req: Request, res: Response) {
  const result = createBackofficeStaffUserSchema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }))
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } },
    })
  }

  const { email, password, name, role, username } = result.data
  const usernameNorm =
    username != null && username.trim() !== '' ? username.trim() : null

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    usernameNorm
      ? prisma.user.findFirst({ where: { username: usernameNorm } })
      : Promise.resolve(null),
  ])
  if (emailTaken) {
    return res.status(409).json({
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' },
    })
  }
  if (usernameTaken) {
    return res.status(409).json({
      success: false,
      error: { code: 'USERNAME_EXISTS', message: 'This username is already taken' },
    })
  }

  const hashedPassword = await hash(password, 12)

  try {
    const user = await prisma.$transaction(async (tx) => {
      const userCode = await generateUserCode(tx)
      const u = await tx.user.create({
        data: {
          user_code: userCode,
          email,
          password: hashedPassword,
          name,
          username: usernameNorm,
          role,
          is_email_verified: true,
          is_active: true,
        },
        select: {
          id: true,
          user_code: true,
          email: true,
          name: true,
          username: true,
          role: true,
          is_email_verified: true,
          is_active: true,
          created_at: true,
        },
      })
      await tx.userWallet.create({
        data: { user_id: u.id, balance: 0, currency: 'THB' },
      })
      return u
    })

    return res.status(201).json({
      success: true,
      data: {
        id: user.id,
        userCode: user.user_code,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        isEmailVerified: user.is_email_verified,
        isActive: user.is_active,
        createdAt: user.created_at.toISOString(),
      },
      message: 'Staff user created',
    })
  } catch (e) {
    console.error('[CreateBackofficeStaff Error]', e)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Could not create user' },
    })
  }
}

export async function meBackoffice(req: Request, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, phone: true, user_code: true, username: true, role: true, is_email_verified: true, created_at: true },
    })
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    const { user_code, is_email_verified, created_at, ...userFields } = user
    return res.json({ success: true, data: { user: { ...userFields, userCode: user_code, isEmailVerified: is_email_verified, createdAt: created_at } } })
  } catch (error) {
    console.error('[Backoffice Me Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}
