/**
 * Cron routes — called by Railway's cron scheduler, not by the frontend.
 *
 * Protected by CRON_SECRET env var (Bearer token), NOT Firebase auth.
 * Railway sends: POST /api/cron/<route> with Authorization: Bearer <CRON_SECRET>
 *
 * To configure in Railway: add a Cron service pointing at this service's URL
 * with the appropriate schedule and Authorization header.
 */
import express from 'express'
import { getAllUserIdsWithItems } from '../db.js'
import { snapshotInvestments } from '../jobs/snapshotInvestments.js'

export const cronRouter = express.Router()

function verifyCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET not set — rejecting request')
    return res.status(500).json({ error: 'Cron not configured' })
  }
  const auth = req.headers['authorization'] ?? ''
  if (auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

/**
 * POST /api/cron/refresh-investments
 *
 * Refreshes investment holdings for every user who has at least one connected item.
 * Runs sequentially to avoid hammering Plaid. Safe to call multiple times per day —
 * snapshotInvestments upserts today's row (one snapshot per account per day).
 *
 * Suggested Railway schedule: 0 6 * * *  (6 AM UTC daily)
 */
cronRouter.post('/refresh-investments', verifyCronSecret, async (req, res) => {
  const startedAt = Date.now()
  console.log('[cron] refresh-investments: starting')

  let userIds
  try {
    userIds = await getAllUserIdsWithItems()
  } catch (err) {
    console.error('[cron] Failed to fetch user list:', err.message)
    return res.status(500).json({ error: 'Failed to fetch users' })
  }

  console.log(`[cron] refresh-investments: ${userIds.length} user(s) to process`)

  const results = { ok: [], failed: [] }

  for (const userId of userIds) {
    try {
      await snapshotInvestments(userId)
      results.ok.push(userId)
      console.log(`[cron] refresh-investments: done for user ${userId}`)
    } catch (err) {
      results.failed.push(userId)
      console.error(`[cron] refresh-investments: failed for user ${userId}:`, err.message)
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`[cron] refresh-investments: finished in ${elapsed}s — ok: ${results.ok.length}, failed: ${results.failed.length}`)

  res.json({
    ok: results.ok.length,
    failed: results.failed.length,
    elapsed_s: parseFloat(elapsed),
  })
})
