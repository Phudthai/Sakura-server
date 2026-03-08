import { Request, Response } from 'express'
import { compare, hash } from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../packages/database/src'
import { loginSchema, registerSchema } from '../../packages/shared/src'
import { importFromExcel } from '../services/excel-import.service'

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

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'This account has been deactivated' } })
    }

    const isValid = await compare(password, user.password)
    if (!isValid) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } })
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
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

    const { email, password, name, phone, username, userId } = result.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' } })
    }

    const hashedPassword = await hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: phone ?? null,
        userCode: username ?? null,
        externalId: userId ?? null,
        role: 'CUSTOMER',
        isEmailVerified: false,
        isActive: true,
      },
      select: { id: true, email: true, name: true, phone: true, userCode: true, externalId: true, role: true, isEmailVerified: true, createdAt: true },
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    if (user.externalId) {
      importFromExcel(user.externalId, user.id).catch((err) => {
        console.error('[Excel Import]', err)
      })
    }

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          username: user.userCode ?? undefined,
          userId: user.externalId ?? undefined,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
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
      select: { id: true, email: true, name: true, phone: true, role: true, isEmailVerified: true, createdAt: true },
    })
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    return res.json({ success: true, data: { user } })
  } catch (error) {
    console.error('[Me Error]', error)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } })
  }
}
