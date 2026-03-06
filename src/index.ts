/**
 * @file index.ts
 * @description Express API server entry point
 * @module @sakura/api
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

import express from 'express'
import cors from 'cors'
import { prisma } from "../packages/database/src";
import authRouter from './routes/auth.routes'

const app = express()
const PORT = process.env.API_PORT || 4000

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/auth', authRouter)

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Test database connection
app.get('/api/test-db', async (_req, res) => {
  try {
    const userCount = await prisma.user.count()
    res.json({
      success: true,
      message: 'Database connected',
      userCount,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Database connection failed',
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})
