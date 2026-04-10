/**
 * Backend entry point. Express app serving:
 * - /api/plaid/webhook (raw body; no auth — verified by Plaid JWT + body hash)
 * - /api/plaid/* (auth required; Firebase ID token or CLI token → req.uid)
 * - /api/cli-auth/* (CLI auth flow — start/firebase-config/exchange are pre-auth)
 * - POST /mcp (MCP server — auth required; CLI or Firebase token)
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
import cliAuthRouter from './routes/cliAuth.js'
import oauthRouter from './routes/oauth.js'
import { mcpHandler } from './mcp/server.js'
import { snapshotInvestments } from './jobs/snapshotInvestments.js'
import { snapshotBalances } from './jobs/snapshotBalances.js'
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

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())
const PORT_ORIGIN = `http://localhost:${process.env.PORT || 3001}`
app.use(cors({
  origin: (origin, cb) => {
    // Allow server-side requests (no origin) — needed for MCP clients like Claude Desktop and ChatGPT
    if (!origin) return cb(null, true)
    // Allow same-origin requests (e.g. cli-auth.html fetching /api/cli-auth/exchange)
    if (origin === PORT_ORIGIN) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    // Allow Claude.ai and any subdomain — needed for MCP connector and OAuth flow
    if (origin === 'https://claude.ai' || origin.endsWith('.claude.ai')) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// Webhook must receive raw body for Plaid signature verification. Register before express.json() so body stays a Buffer.
app.post('/api/plaid/webhook', express.raw({ type: 'application/json' }), plaidWebhookHandler)

app.use(express.json())
app.use(express.urlencoded({ extended: false })) // for OAuth token endpoint (application/x-www-form-urlencoded)

app.get('/health', (req, res) => res.json({ ok: true }))

// Temporary request logger — helps debug Claude.ai connector flow
app.use((req, res, next) => {
  const origin = req.get('origin') ?? req.get('referer') ?? 'no-origin'
  const oldEnd = res.end.bind(res)
  res.end = function (...args) {
    console.log(`[req] ${req.method} ${req.path} → ${res.statusCode} — origin: ${origin} body: ${JSON.stringify(req.body ?? null)}`)
    return oldEnd(...args)
  }
  next()
})

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

// Disable HTTP caching on API routes so browsers always get fresh data
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/api/plaid', authMiddleware, plaidRouter)
app.use('/api/agent', authMiddleware, agentRouter)
app.use('/api/cron', cronRouter)
app.use('/api/cli-auth', cliAuthRouter)
app.use('/oauth', oauthRouter) // CLI-facing paths (/oauth/authorize, etc.)
app.use('/', oauthRouter)    // Claude.ai strips path prefix and hits /register, /authorize, /token directly
app.all('/mcp', authMiddleware, mcpHandler)

// OAuth / MCP discovery endpoints (RFC 8414 + MCP spec)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const proto = req.get('x-forwarded-proto') ?? req.protocol
  const base = `${proto}://${req.get('host')}`
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  })
})

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const proto = req.get('x-forwarded-proto') ?? req.protocol
  const base = `${proto}://${req.get('host')}`
  res.json({
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
  })
})

// Serve static auth pages from public/ — works in dev mode without a Vite build
app.get('/cli-auth.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'cli-auth.html'))
})
app.get('/oauth-authorize.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'oauth-authorize.html'))
})

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

// Daily snapshot at market close (4:29 PM ET) with retry at 5:00 PM ET
const CRON_OPTS = { timezone: 'America/New_York' }

async function runDailySnapshot(label) {
  const start = Date.now()
  console.log(`[cron:${label}] starting daily snapshot`)
  const userIds = await getAllUserIdsWithItems().catch((err) => {
    console.error(`[cron:${label}] failed to fetch user IDs:`, err.message)
    return []
  })

  // Investment snapshots (holdings + portfolio values)
  let invOk = 0, invFailed = 0
  for (const userId of userIds) {
    try {
      await snapshotInvestments(userId)
      invOk++
    } catch (err) {
      console.error(`[cron:${label}] snapshotInvestments failed for user ${userId}:`, err.message)
      invFailed++
    }
  }
  console.log(`[cron:${label}] investment snapshot done — ${invOk} ok, ${invFailed} failed`)

  // Balance snapshots (depository/credit/loan accounts)
  let balOk = 0, balFailed = 0
  for (const userId of userIds) {
    try {
      await snapshotBalances(userId)
      balOk++
    } catch (err) {
      console.error(`[cron:${label}] snapshotBalances failed for user ${userId}:`, err.message)
      balFailed++
    }
  }
  console.log(`[cron:${label}] balance snapshot done — ${balOk} ok, ${balFailed} failed, ${((Date.now() - start) / 1000).toFixed(1)}s total`)

  return { invFailed, balFailed }
}

// Primary: 4:29 PM ET every day (including weekends)
cron.schedule('29 16 * * *', () => runDailySnapshot('close'), CRON_OPTS)

// Retry: 5:00 PM ET every day — re-runs snapshot (upserts are idempotent, so safe even if 4:29 succeeded)
cron.schedule('0 17 * * *', () => runDailySnapshot('retry'), CRON_OPTS)

