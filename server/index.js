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

import { authMiddleware } from './middleware/auth.js'
import { plaidRouter, plaidWebhookHandler } from './routes/plaid.js'
import { agentRouter } from './routes/agent.js'
import { cronRouter } from './routes/cron.js'

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

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`))
