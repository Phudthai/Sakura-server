/**
 * @file auth.controller.ts
 * @description Backoffice authentication — ADMIN/STAFF only
 */

import { Request, Response } from 'express'
import { compare } from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../../packages/database/src'
import { loginSchema } from '../../../packages/shared/src'

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

    if (!user.isActive) {
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
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
        },
      },
      message: 'Logged in successfully',
    })
  } catch (error) {
    console.error('[Backoffice Login Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}

export async function meBackoffice(req: Request, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, phone: true, userCode: true, username: true, role: true, isEmailVerified: true, createdAt: true },
    })
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    return res.json({ success: true, data: { user } })
  } catch (error) {
    console.error('[Backoffice Me Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}
