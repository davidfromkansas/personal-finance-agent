/**
 * CLI / MCP auth routes — browser-redirect OAuth flow.
 *
 * GET  /api/cli-auth/start?port=PORT         → redirects browser to /cli-auth.html?port=PORT
 * GET  /api/cli-auth/firebase-config         → returns public Firebase config for the login page
 * POST /api/cli-auth/exchange                → verifies Firebase ID token, issues a CLI token
 * POST /api/cli-auth/revoke                  → deletes all CLI tokens for the authenticated user
 *
 * No authMiddleware on this router — start/firebase-config/exchange are pre-auth by design.
 * Revoke verifies its own Firebase ID token inline.
 */
import { Router } from 'express'
import crypto from 'crypto'
import { verifyIdToken } from '../middleware/auth.js'
import { createCliToken, getCliTokenByHash, revokeAllCliTokens } from '../db.js'

const router = Router()

/** Redirect browser to the login page with the port embedded */
router.get('/start', (req, res) => {
  const port = parseInt(req.query.port, 10)
  if (!port || port < 1024 || port > 65535) {
    return res.status(400).send('Invalid port')
  }
  res.redirect(`/cli-auth.html?port=${port}`)
})

/** Public Firebase client config — safe to expose (these are not secrets) */
router.get('/firebase-config', (req, res) => {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  }
  if (!config.apiKey || !config.projectId) {
    return res.status(500).json({ error: 'Firebase client config not set on server' })
  }
  res.json(config)
})

/** Exchange a Firebase ID token for a long-lived CLI token */
router.post('/exchange', async (req, res) => {
  try {
    const { firebaseIdToken, name } = req.body
    if (!firebaseIdToken) {
      return res.status(400).json({ error: 'firebaseIdToken is required' })
    }

    const userId = await verifyIdToken(firebaseIdToken)

    // Generate token: "cli_" + 48 random bytes as hex = 100-char string
    const rawToken = 'cli_' + crypto.randomBytes(48).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    await createCliToken(userId, tokenHash, name ?? null, expiresAt.toISOString())

    res.json({ token: rawToken })
  } catch (err) {
    console.error('[cli-auth] exchange error:', err.message)
    res.status(401).json({ error: 'Authentication failed' })
  }
})

/** Revoke all CLI tokens for the authenticated user */
router.post('/revoke', async (req, res) => {
  try {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

    // Accept either a Firebase ID token or a CLI token for revocation
    let userId
    if (token.startsWith('cli_')) {
      const hash = crypto.createHash('sha256').update(token).digest('hex')
      const row = await getCliTokenByHash(hash)
      if (!row || new Date(row.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }
      userId = row.user_id
    } else {
      userId = await verifyIdToken(token)
    }

    await revokeAllCliTokens(userId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[cli-auth] revoke error:', err.message)
    res.status(401).json({ error: 'Authentication failed' })
  }
})

export default router
