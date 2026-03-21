/**
 * @file auth.controller.ts
 * @description Enduser authentication
 */

import { Request, Response } from 'express'
import { compare, hash } from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma, generateUserCode } from '../../../packages/database/src'
import { loginSchema, registerSchema } from '../../../packages/shared/src'
import { importFromExcel } from '../../services/excel-import.service'

const JWT_SECRET = process.env.JWT_SECRET ?? 'sakura-dev-secret-change-in-production'
const JWT_EXPIRES_IN = '7d'

function signToken(payload: { userId: number; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export async function login(req: Request, res: Response) {
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
    console.error('[Login Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}

export async function register(req: Request, res: Response) {
  try {
    const result = registerSchema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { errors } } })
    }

    const { email, password, name, phone, username, userId, user_code } = result.data
    const hashedPassword = await hash(password, 12)

    if (user_code) {
      const placeholder = await prisma.user.findUnique({ where: { user_code: user_code } })
      if (!placeholder) {
        return res.status(404).json({ success: false, error: { code: 'INVALID_USER_CODE', message: 'Invalid user code' } })
      }
      if (placeholder.email) {
        return res.status(409).json({ success: false, error: { code: 'ALREADY_REGISTERED', message: 'This user code has already been registered' } })
      }

      const existingByEmail = await prisma.user.findUnique({ where: { email } })
      if (existingByEmail && existingByEmail.id !== placeholder.id) {
        return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' } })
      }

      const user = await prisma.user.update({
        where: { id: placeholder.id },
        data: {
          email,
          password: hashedPassword,
          name,
          phone: phone ?? null,
          username: username ?? null,
          external_id: userId ?? placeholder.external_id,
        },
        select: { id: true, email: true, name: true, phone: true, user_code: true, username: true, external_id: true, role: true, is_email_verified: true, created_at: true },
      })

      const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })

      if (user.external_id) {
        importFromExcel(user.external_id, user.id).catch((err) => {
          console.error('[Excel Import]', err)
        })
      }

      return res.status(201).json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email ?? null,
            name: user.name ?? null,
            phone: user.phone,
            userCode: user.user_code,
            username: user.username ?? undefined,
            userId: user.external_id ?? undefined,
            role: user.role,
            isEmailVerified: user.is_email_verified,
            createdAt: user.created_at,
          },
        },
        message: 'Account created successfully',
      })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' } })
    }

    const userCode = await generateUserCode(prisma)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: phone ?? null,
        user_code: userCode,
        username: username ?? null,
        external_id: userId ?? null,
        role: 'CUSTOMER',
        is_email_verified: false,
        is_active: true,
      },
      select: { id: true, email: true, name: true, phone: true, user_code: true, username: true, external_id: true, role: true, is_email_verified: true, created_at: true },
    })

    const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })

    if (user.external_id) {
      importFromExcel(user.external_id, user.id).catch((err) => {
        console.error('[Excel Import]', err)
      })
    }

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email ?? null,
          name: user.name ?? null,
          phone: user.phone,
          userCode: user.user_code,
          username: user.username ?? undefined,
          userId: user.external_id ?? undefined,
          role: user.role,
          isEmailVerified: user.is_email_verified,
          createdAt: user.created_at,
        },
      },
      message: 'Account created successfully',
    })
  } catch (error) {
    console.error('[Register Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}

export async function me(req: Request, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, email: true, name: true, phone: true,
        user_code: true, username: true, role: true,
        is_email_verified: true, created_at: true,
        wallet: { select: { balance: true, currency: true } },
      },
    })
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    const { wallet, user_code, is_email_verified, created_at, ...userFields } = user
    return res.json({
      success: true,
      data: {
        ...userFields,
        userCode: user_code,
        isEmailVerified: is_email_verified,
        createdAt: created_at,
        wallet: wallet
          ? { balance: wallet.balance, currency: wallet.currency }
          : { balance: 0, currency: 'THB' },
      },
    })
  } catch (error) {
    console.error('[Me Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}
