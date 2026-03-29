/**
 * OAuth 2.0 authorization server for MCP connector access.
 *
 * Implements authorization code flow with PKCE (RFC 7636).
 * Access tokens issued are CLI tokens (cli_...) — same as the CLI auth flow,
 * so no changes to auth middleware are needed.
 *
 * Endpoints:
 *   POST /oauth/register            — dynamic client registration (RFC 7591)
 *   GET  /oauth/authorize           — start auth; store state, redirect to sign-in page
 *   POST /oauth/authorize/complete  — called by sign-in page after Firebase sign-in
 *   POST /oauth/token               — exchange auth code + PKCE verifier for access token
 */
import { Router } from 'express'
import crypto from 'crypto'
import { verifyIdToken } from '../middleware/auth.js'
import { createCliToken } from '../db.js'

const router = Router()

// ── In-memory stores (short-lived; no DB needed) ──────────────────────────────
// sessionId → { clientId, redirectUri, state, codeChallenge, codeChallengeMethod, expiresAt }
const pendingSessions = new Map()
// code → { userId, clientId, redirectUri, codeChallenge, codeChallengeMethod, expiresAt, used }
const authCodes = new Map()

// Purge expired entries every minute
setInterval(() => {
  const now = new Date()
  for (const [k, v] of pendingSessions) { if (v.expiresAt < now) pendingSessions.delete(k) }
  for (const [k, v] of authCodes)       { if (v.expiresAt < now) authCodes.delete(k) }
}, 60_000).unref()

// ── Dynamic client registration (RFC 7591) ────────────────────────────────────
// Accept any client; return a client_id. We don't validate client_ids strictly
// (security comes from PKCE), but we need to support registration so Claude.ai
// can connect without the user having to pre-configure a Client ID.
router.post('/register', (req, res) => {
  res.status(201).json({
    client_id: crypto.randomUUID(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  })
})

// ── Authorization endpoint ────────────────────────────────────────────────────
// Validates OAuth params, stores them in a short-lived session, then redirects
// the user's browser to /oauth-authorize.html to complete Google sign-in.
router.get('/authorize', (req, res) => {
  const { response_type, redirect_uri, state, code_challenge, code_challenge_method } = req.query

  if (response_type !== 'code') {
    return res.status(400).send('Unsupported response_type — only "code" is supported')
  }
  if (!redirect_uri) return res.status(400).send('Missing redirect_uri')
  if (!code_challenge) return res.status(400).send('PKCE code_challenge is required')
  if (code_challenge_method && code_challenge_method !== 'S256') {
    return res.status(400).send('Only S256 code_challenge_method is supported')
  }

  const sessionId = crypto.randomUUID()
  pendingSessions.set(sessionId, {
    clientId: req.query.client_id ?? null,
    redirectUri: redirect_uri,
    state: state ?? null,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method ?? 'S256',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
  })

  res.redirect(`/oauth-authorize.html?session_id=${encodeURIComponent(sessionId)}`)
})

// ── Complete authorization ────────────────────────────────────────────────────
// Called by oauth-authorize.html after the user signs in with Google.
// Verifies the Firebase ID token, generates a short-lived auth code, and
// returns the redirect URL for the page to navigate to.
router.post('/authorize/complete', async (req, res) => {
  try {
    const { firebaseIdToken, sessionId } = req.body
    if (!firebaseIdToken || !sessionId) {
      return res.status(400).json({ error: 'Missing firebaseIdToken or sessionId' })
    }

    const session = pendingSessions.get(sessionId)
    if (!session || session.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Session expired or not found. Please try again.' })
    }
    pendingSessions.delete(sessionId)

    const userId = await verifyIdToken(firebaseIdToken)

    const code = crypto.randomBytes(32).toString('hex')
    authCodes.set(code, {
      userId,
      clientId: session.clientId,
      redirectUri: session.redirectUri,
      codeChallenge: session.codeChallenge,
      codeChallengeMethod: session.codeChallengeMethod,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      used: false,
    })

    const redirectUrl = new URL(session.redirectUri)
    redirectUrl.searchParams.set('code', code)
    if (session.state) redirectUrl.searchParams.set('state', session.state)

    res.json({ redirect_to: redirectUrl.toString() })
  } catch (err) {
    console.error('[oauth] authorize/complete error:', err.message)
    res.status(401).json({ error: 'Authentication failed' })
  }
})

// ── Token endpoint ────────────────────────────────────────────────────────────
// Exchanges an auth code + PKCE code_verifier for a long-lived access token.
// Accepts both application/json and application/x-www-form-urlencoded bodies.
router.post('/token', async (req, res) => {
  // Allow CORS — token endpoint is called by OAuth clients from any origin
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    const { grant_type, code, redirect_uri, code_verifier, client_id } = req.body

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' })
    }
    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing code or code_verifier' })
    }

    const stored = authCodes.get(code)
    if (!stored || stored.expiresAt < new Date() || stored.used) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' })
    }
    if (redirect_uri && stored.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
    }

    // Verify PKCE: SHA256(code_verifier) must equal stored code_challenge
    const challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url')
    if (challenge !== stored.codeChallenge) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' })
    }

    stored.used = true // single-use

    // Issue a CLI token (same format as existing auth flow — auth middleware already handles it)
    const rawToken = 'cli_' + crypto.randomBytes(48).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    await createCliToken(stored.userId, tokenHash, `Claude.ai connector (${client_id ?? 'unknown'})`, expiresAt.toISOString())

    res.json({
      access_token: rawToken,
      token_type: 'bearer',
      expires_in: 365 * 24 * 60 * 60, // 1 year in seconds
    })
  } catch (err) {
    console.error('[oauth] token error:', err.message)
    res.status(500).json({ error: 'server_error' })
  }
})

// Pre-flight for token endpoint
router.options('/token', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.sendStatus(204)
})

export default router
