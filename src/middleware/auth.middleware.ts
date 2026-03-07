/**
 * @file auth.middleware.ts
 * @description JWT authentication middleware
 * @module @sakura/api/middleware
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'sakura-dev-secret-change-in-production'

export interface JwtPayload {
  userId: number
  email: string
  role: string
}

// Extend Express Request to carry user info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

/**
 * Sets req.user if a valid token is provided. Does NOT reject missing tokens.
 * Use for endpoints that work for both guests and logged-in users.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req)
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as JwtPayload
    } catch {
      // invalid token — treat as guest
    }
  }
  next()
}

/**
 * Requires a valid JWT. Optionally restricts to specific roles.
 * Returns 401 if no token, 403 if role is not allowed.
 */
export function requireAuth(roles?: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractToken(req)
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return
    }

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    } catch {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } })
      return
    }

    if (roles && roles.length > 0 && !roles.includes(payload.role)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
      return
    }

    req.user = payload
    next()
  }
}
