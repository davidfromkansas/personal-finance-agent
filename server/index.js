/**
 * Backend entry point. Express app serving:
 * - /api/plaid/webhook (raw body; no auth — verified by Plaid JWT + body hash)
 * - /api/plaid/* (auth required; Firebase ID token → req.uid)
 * - Static SPA from dist/ (index.html for /app, logged-out-landing-page.html for /)
 * Loads server/.env; CORS and auth middleware applied to API routes.
 */
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import cron from 'node-cron'
import { authMiddleware } from './middleware/auth.js'
import { plaidRouter, plaidWebhookHandler } from './routes/plaid.js'
import { agentRouter } from './routes/agent.js'
import { runDemoChat } from './agent/chat.js'
import { cronRouter } from './routes/cron.js'
import { snapshotInvestments } from './jobs/snapshotInvestments.js'
import { getAllUserIdsWithItems } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  console.error('Missing Plaid keys. In server/.env set PLAID_CLIENT_ID and PLAID_SECRET (from dashboard.plaid.com → your app → Keys).')
  process.exit(1)
}

console.log('Config:', JSON.stringify({
  NODE_ENV: process.env.NODE_ENV ?? 'not set',
  PLAID_ENV: process.env.PLAID_ENV ?? 'sandbox',
  PLAID_PRODUCTS: process.env.PLAID_PRODUCTS ?? 'transactions (default)',
  PLAID_REDIRECT_URI: process.env.PLAID_REDIRECT_URI ?? 'not set',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173 (default)',
  DATABASE_URL: process.env.DATABASE_URL ? '***set***' : 'NOT SET',
  FIREBASE_AUTH: process.env.FIREBASE_SERVICE_ACCOUNT ? 'JSON env var' : process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? 'NOT SET',
}))

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))

// Webhook must receive raw body for Plaid signature verification. Register before express.json() so body stays a Buffer.
app.post('/api/plaid/webhook', express.raw({ type: 'application/json' }), plaidWebhookHandler)

app.use(express.json())

app.get('/health', (req, res) => res.json({ ok: true }))

app.post('/api/agent/chat-demo', async (req, res, next) => {
  try {
    const { message, history, mode, demoContext } = req.body

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)

    try {
      for await (const chunk of runDemoChat({ message, history: history ?? [], mode: mode ?? 'Auto', demoContext })) {
        emit({ type: 'text', text: chunk })
      }
    } catch (err) {
      emit({ type: 'error', message: 'Something went wrong. Please try again.' })
    }

    emit({ type: 'done' })
    res.end()
  } catch (err) {
    next(err)
  }
})

app.use('/api/plaid', authMiddleware, plaidRouter)
app.use('/api/agent', authMiddleware, agentRouter)
app.use('/api/cron', cronRouter)

const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    const indexPath = req.path.startsWith('/app') ? 'index.html' : 'logged-out-landing-page.html'
    res.sendFile(path.join(distPath, indexPath))
  })
}

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' })
})

const server = app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`))

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Kill the old process (lsof -ti:${PORT} | xargs kill) and retry.`)
  } else {
    console.error('Server error:', err)
  }
  process.exit(1)
})

function shutdown(signal) {
  console.log(`[shutdown] ${signal} received — closing server`)
  server.close(() => {
    console.log('[shutdown] server closed')
    process.exit(0)
  })
  // Force-exit if graceful close takes too long
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Daily investment snapshot — runs every 5 min in dev/testing, change to '0 22 * * *' for production
const CRON_SCHEDULE = process.env.SNAPSHOT_CRON ?? '*/5 * * * *'
cron.schedule(CRON_SCHEDULE, async () => {
  console.log('[cron] starting daily investment snapshot')
  const start = Date.now()
  const userIds = await getAllUserIdsWithItems().catch((err) => {
    console.error('[cron] failed to fetch user IDs:', err.message)
    return []
  })
  let ok = 0, failed = 0
  for (const userId of userIds) {
    try {
      await snapshotInvestments(userId)
      ok++
    } catch (err) {
      console.error(`[cron] snapshotInvestments failed for user ${userId}:`, err.message)
      failed++
    }
  }
  console.log(`[cron] investment snapshot done — ${ok} ok, ${failed} failed, ${((Date.now() - start) / 1000).toFixed(1)}s`)
})

