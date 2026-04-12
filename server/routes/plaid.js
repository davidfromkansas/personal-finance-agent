/**
 * Plaid API routes and webhook handler. All routes except webhook use authMiddleware (req.uid).
 * - Balance/accounts: in-memory cache (5 min TTL) + request deduplication; accountsGet by default (fast, Plaid-cached); accountsBalanceGet on manual refresh (real-time).
 * - Webhook: POST /api/plaid/webhook verified via Plaid JWT + body SHA-256; on SYNC_UPDATES_AVAILABLE runs incremental sync.
 * - Refresh: calls Plaid transactions/refresh then sync; invalidates balance cache for that user.
 */
import { Router } from 'express'
import crypto from 'crypto'
import * as jose from 'jose'
import YahooFinance from 'yahoo-finance2'
import { getPlaidClient } from '../lib/plaidClient.js'
import { snapshotInvestments } from '../jobs/snapshotInvestments.js'
import { todayET, toDateStrET } from '../lib/dateUtils.js'

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] })
import {
  getPlaidItemsByUserId, getPlaidItemByItemId, getPlaidItemByInstitutionId, upsertPlaidItem, deletePlaidItem, updateAccountsCache,
  getSyncCursor, updateSyncCursor, clearSyncCursor, setItemErrorCode, clearItemErrorCode, upsertTransactions, deleteTransactionsByPlaidIds, getLogoUrlsByPlaidTransactionIds,
  getRecentTransactions, getTransactionCategories, getTransactionAccounts, getSpendingSummaryByAccount, getTransactionsForNetWorth, getEarliestTransactionDate, getInvestmentBalanceHistory,
  getMonthlyCashFlow, getCashFlowTimeSeries, getCashFlowTransactions, getCashFlowBreakdown, getCashFlowNodeTransactions,
  updateTransactionAccountNames, updateTransactionCategory, updateTransactionRecurring, getSubscriptionPayments,
  getPortfolioHistory, getPortfolioAccountHistory, getLatestPortfolioValue, hasTodaySnapshot, getHoldingsSnapshotForDate, getHoldingsHistory, getLatestHoldingsSnapshot,
  upsertAccountBalanceSnapshot, getAccountBalanceHistory, getLatestAccountBalances, getLatestInvestmentAccountBalances,
  getInvestmentTransactionsByAccount,
  getInvestmentTransactionsByTicker,
} from '../db.js'

/* ── Unified per-item account cache with request deduplication ────── */

const CACHE_TTL_MS = 5 * 60 * 1000
const FAIL_TTL_MS = 60 * 1000
const itemCache = new Map()
const inflight = new Map()
const userItemIndex = new Map()

/* ── Background sync tracking ─────────────────────────────────────── */
const syncingItems = new Set() // item_ids currently being synced in the background

/* ── Institution logo cache (by institution_id) ───────────────────── */
const LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const ITEM_TO_INSTITUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const institutionLogoCache = new Map() // institution_id -> { logo: string, ts: number }
const itemToInstitutionCache = new Map() // item_id -> { institution_id: string, ts: number }
const inflightLogos = new Map() // institution_id -> Promise<string | null>

/* ── Webhook verification key cache (kid -> JWK) ───────────────────── */
const webhookKeyCache = new Map()

/**
 * Verify Plaid webhook using Plaid-Verification JWT and raw body hash.
 * @param {Buffer} rawBody - Raw request body (for SHA-256 and parsing)
 * @param {string} verificationHeader - Value of Plaid-Verification header
 * @returns {{ valid: boolean }} valid true iff signature and body hash pass
 */
async function verifyPlaidWebhook(rawBody, verificationHeader) {
  if (!verificationHeader || typeof verificationHeader !== 'string') return { valid: false }
  const signedJwt = verificationHeader.trim()
  let header
  try {
    header = jose.decodeProtectedHeader(signedJwt)
  } catch (_) {
    return { valid: false }
  }
  if (header.alg !== 'ES256') return { valid: false }
  const keyId = header.kid
  if (!keyId) return { valid: false }

  let jwk = webhookKeyCache.get(keyId)
  if (!jwk) {
    try {
      const plaidClient = getPlaidClient()
      const res = await plaidClient.webhookVerificationKeyGet({ key_id: keyId })
      jwk = res.data.key
      if (jwk) webhookKeyCache.set(keyId, jwk)
    } catch (err) {
      console.warn('[plaid webhook] Failed to fetch verification key:', err.response?.data ?? err.message)
      return { valid: false }
    }
  }
  if (!jwk) return { valid: false }

  let keyLike
  try {
    keyLike = await jose.importJWK(jwk, 'ES256')
  } catch (err) {
    console.warn('[plaid webhook] Failed to import JWK:', err.message)
    return { valid: false }
  }

  let payload
  try {
    const { payload: p } = await jose.jwtVerify(signedJwt, keyLike, { maxTokenAge: '5 min' })
    payload = p
  } catch (err) {
    return { valid: false }
  }

  const claimedHash = payload.request_body_sha256
  if (!claimedHash || typeof claimedHash !== 'string') return { valid: false }
  const computedHash = crypto.createHash('sha256').update(rawBody).digest('hex')
  if (claimedHash.length !== computedHash.length) return { valid: false }
  try {
    const claimedBuf = Buffer.from(claimedHash, 'hex')
    const computedBuf = Buffer.from(computedHash, 'hex')
    if (claimedBuf.length !== computedBuf.length || !crypto.timingSafeEqual(claimedBuf, computedBuf)) {
      return { valid: false }
    }
  } catch (_) {
    return { valid: false }
  }
  return { valid: true }
}

function mapPlaidAccounts(plaidAccounts) {
  return (plaidAccounts ?? []).map((acc) => ({
    account_id: acc.account_id,
    name: acc.official_name || acc.name || 'Account',
    type: (acc.type || 'other').toLowerCase(),
    subtype: acc.subtype ?? null,
    current: acc.balances?.current ?? 0,
    available: acc.balances?.available ?? null,
    currency: acc.balances?.iso_currency_code ?? 'USD',
  }))
}

function trackUserItem(userId, itemId) {
  if (!userItemIndex.has(userId)) userItemIndex.set(userId, new Set())
  userItemIndex.get(userId).add(itemId)
}

function snapshotBalancesInBackground(userId, row, rawAccounts) {
  const date = todayET()
  for (const acc of rawAccounts ?? []) {
    upsertAccountBalanceSnapshot(userId, row.item_id, row.institution_name ?? null, {
      account_id: acc.account_id,
      name: acc.official_name || acc.name || 'Account',
      type: (acc.type || 'other').toLowerCase(),
      subtype: acc.subtype ?? null,
      current: acc.balances?.current ?? null,
      available: acc.balances?.available ?? null,
      limit: acc.balances?.limit ?? null,
      currency: acc.balances?.iso_currency_code ?? 'USD',
    }, date).catch((err) => console.error(`[balance snapshot] account ${acc.account_id}:`, err.message))
  }
}

async function _callPlaid(plaidClient, userId, row, useBalanceGet) {
  try {
    const res = useBalanceGet
      ? await plaidClient.accountsBalanceGet({ access_token: row.access_token })
      : await plaidClient.accountsGet({ access_token: row.access_token })
    const accounts = mapPlaidAccounts(res.data.accounts)
    itemCache.set(row.item_id, { ts: Date.now(), accounts })
    updateAccountsCache(userId, row.item_id, accounts).catch(() => {})
    snapshotBalancesInBackground(userId, row, res.data.accounts)
    return { accounts, error: null }
  } catch (err) {
    const code = err.response?.data?.error_code ?? null
    if (useBalanceGet && code === 'BALANCE_LIMIT') {
      try {
        const fallback = await plaidClient.accountsGet({ access_token: row.access_token })
        const accounts = mapPlaidAccounts(fallback.data.accounts)
        itemCache.set(row.item_id, { ts: Date.now(), accounts })
        updateAccountsCache(userId, row.item_id, accounts).catch(() => {})
        snapshotBalancesInBackground(userId, row, fallback.data.accounts)
        return { accounts, error: null }
      } catch (_) {}
    }
    return { accounts: null, error: err, code }
  } finally {
    inflight.delete(row.item_id)
  }
}

async function fetchItemAccounts(plaidClient, userId, row, useBalanceGet = false) {
  trackUserItem(userId, row.item_id)

  const cached = itemCache.get(row.item_id)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.accounts

  let pending = inflight.get(row.item_id)
  if (!pending) {
    pending = _callPlaid(plaidClient, userId, row, useBalanceGet)
    inflight.set(row.item_id, pending)
  }

  const result = await pending
  if (result.accounts) return result.accounts

  const failTs = Date.now() - CACHE_TTL_MS + FAIL_TTL_MS

  if (cached) {
    itemCache.set(row.item_id, { ts: failTs, accounts: cached.accounts })
    return cached.accounts
  }
  const dbAccounts = row.accounts_cache
  if (dbAccounts) {
    itemCache.set(row.item_id, { ts: failTs, accounts: dbAccounts })
    return dbAccounts
  }

  itemCache.set(row.item_id, { ts: failTs, accounts: [] })
  return []
}

async function getAllUserAccounts(userId) {
  const items = await getPlaidItemsByUserId(userId)
  const plaidClient = getPlaidClient()
  const results = await Promise.all(
    items.map(async (row) => {
      try {
        return await fetchItemAccounts(plaidClient, userId, row)
      } catch (err) {
        console.error(`Balance fetch failed for item ${row.item_id}:`, err.response?.data ?? err.message)
        return []
      }
    })
  )
  return results.flat()
}

function invalidateBalanceCache(userId) {
  const itemIds = userItemIndex.get(userId)
  if (itemIds) {
    for (const id of itemIds) {
      itemCache.delete(id)
      inflight.delete(id)
    }
  }
}

/* ── Plaid client ────────────────────────────────────────────────── */


/* ── Transaction sync helper ─────────────────────────────────────── */

/** Backfill up to 2 years of transactions using transactionsGet (explicit date range).
 *  Uses upsert so duplicates with transactionsSync are harmless. */
async function backfillTransactionsGet(plaidClient, userId, itemId, accessToken) {
  const endDate = todayET()
  const startD = new Date()
  startD.setFullYear(startD.getFullYear() - 2)
  const startDate = toDateStrET(startD)

  let accountNames = {}
  try {
    const acctRes = await plaidClient.accountsGet({ access_token: accessToken })
    for (const a of acctRes.data.accounts ?? []) {
      accountNames[a.account_id] = a.official_name || a.name || a.subtype || 'Account'
    }
  } catch (_) {}

  let totalFetched = 0
  let offset = 0
  const PAGE_SIZE = 500
  while (true) {
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: PAGE_SIZE, offset, include_personal_finance_category: true, include_original_description: true },
    })
    const txns = response.data.transactions
    if (!txns.length) break

    const toUpsert = txns.map(t => {
      const logoUrl = t.logo_url ?? t.counterparties?.[0]?.logo_url ?? null
      const loc = t.location ?? null
      const location = (loc && Object.values(loc).some(Boolean)) ? loc : null
      const paymentMeta = t.payment_meta ?? null
      const hasPaymentMeta = paymentMeta && Object.values(paymentMeta).some(Boolean)
      return {
        account_id: t.account_id,
        transaction_id: t.transaction_id,
        name: t.name || t.merchant_name || 'Transaction',
        amount: t.amount,
        date: t.date,
        authorized_date: t.authorized_date ?? null,
        account_name: accountNames[t.account_id] ?? null,
        payment_channel: t.payment_channel ?? null,
        personal_finance_category: t.personal_finance_category?.primary ?? null,
        pending: t.pending === true,
        logo_url: logoUrl,
        original_description: t.original_description ?? null,
        merchant_name: t.merchant_name ?? null,
        location,
        website: t.website ?? null,
        personal_finance_category_detailed: t.personal_finance_category?.detailed ?? null,
        personal_finance_category_confidence: t.personal_finance_category?.confidence_level ?? null,
        counterparties: t.counterparties?.length ? t.counterparties : null,
        payment_meta: hasPaymentMeta ? paymentMeta : null,
        check_number: t.check_number ?? null,
      }
    })
    await upsertTransactions(userId, itemId, toUpsert)
    totalFetched += txns.length
    console.log(`[backfill] item ${itemId}: fetched ${txns.length} transactions (offset ${offset}, total so far ${totalFetched})`)

    if (offset + txns.length >= response.data.total_transactions) break
    offset += txns.length
  }
  console.log(`[backfill] item ${itemId}: done — ${totalFetched} total transactions`)
  return totalFetched
}

async function syncTransactionsForItem(plaidClient, userId, itemId, accessToken) {
  let cursor = await getSyncCursor(userId, itemId)
  let hasMore = true
  let page = 0
  let totalAdded = 0

  let accountNames = {}
  try {
    const acctRes = await plaidClient.accountsGet({ access_token: accessToken })
    for (const a of acctRes.data.accounts ?? []) {
      accountNames[a.account_id] = a.official_name || a.name || a.subtype || 'Account'
    }
  } catch (_) {}

  for (const [accountId, name] of Object.entries(accountNames)) {
    await updateTransactionAccountNames(userId, accountId, name)
  }

  while (hasMore) {
    page++
    const request = {
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      options: { personal_finance_category_version: 'v2', include_original_description: true },
    }
    const res = await plaidClient.transactionsSync(request)
    const { added, modified, removed, next_cursor, has_more } = res.data
    console.log(`[sync] item ${itemId} page ${page}: +${added.length} added, ~${modified.length} modified, -${removed.length} removed, has_more=${has_more}`)

    const toUpsert = [...added, ...modified].map((t) => {
      const logoUrl = t.logo_url ?? t.logoUrl ?? t.counterparties?.[0]?.logo_url ?? t.counterparties?.[0]?.logoUrl ?? null
      const loc = t.location ?? null
      const location = (loc && Object.values(loc).some(Boolean)) ? loc : null
      const paymentMeta = t.payment_meta ?? null
      const hasPaymentMeta = paymentMeta && Object.values(paymentMeta).some(Boolean)
      return {
        account_id: t.account_id,
        transaction_id: t.transaction_id,
        name: t.name || t.merchant_name || 'Transaction',
        amount: t.amount,
        date: t.date,
        authorized_date: t.authorized_date ?? null,
        account_name: accountNames[t.account_id] ?? null,
        payment_channel: t.payment_channel ?? null,
        personal_finance_category: t.personal_finance_category?.primary ?? null,
        pending: t.pending === true,
        logo_url: logoUrl,
        original_description: t.original_description ?? null,
        merchant_name: t.merchant_name ?? null,
        location,
        website: t.website ?? null,
        personal_finance_category_detailed: t.personal_finance_category?.detailed ?? null,
        personal_finance_category_confidence: t.personal_finance_category?.confidence_level ?? null,
        counterparties: t.counterparties?.length ? t.counterparties : null,
        payment_meta: hasPaymentMeta ? paymentMeta : null,
        check_number: t.check_number ?? null,
      }
    })
    const pendingCount = toUpsert.filter((t) => t.pending).length
    if (pendingCount > 0) {
      console.log(`[plaid sync] item ${itemId}: ${pendingCount} pending transaction(s) in this batch`)
    }
    if (toUpsert.length) await upsertTransactions(userId, itemId, toUpsert)
    totalAdded += added.length

    const toRemove = (removed ?? []).map((r) => r.transaction_id)
    if (toRemove.length) await deleteTransactionsByPlaidIds(toRemove)

    cursor = next_cursor
    hasMore = has_more
  }
  console.log(`[sync] item ${itemId} done: ${page} page(s), ${totalAdded} transactions fetched`)

  await updateSyncCursor(userId, itemId, cursor)
}

/* ── Routes ──────────────────────────────────────────────────────── */

export const plaidRouter = Router()

/** POST /api/plaid/link-token — create link token for Plaid Link */
plaidRouter.post('/link-token', async (req, res, next) => {
  try {
    const plaidClient = getPlaidClient()
    const envProducts = (process.env.PLAID_PRODUCTS || 'transactions').split(',').map((p) => p.trim())
    // Plaid requires at least one product; we can't require "transactions OR investments" in one token.
    // link_mode: 'investments' = require investments (for brokerage-only); otherwise require transactions (credit/depository).
    const linkMode = req.body?.link_mode === 'investments' ? 'investments' : 'transactions'
    let required
    let optionalProducts = []
    if (linkMode === 'investments') {
      required = ['investments']
      if (envProducts.includes('transactions')) optionalProducts = ['transactions']
    } else {
      required = envProducts.filter((p) => p !== 'investments').length
        ? envProducts.filter((p) => p !== 'investments')
        : ['transactions']
      if (envProducts.includes('investments')) optionalProducts = ['investments']
    }
    // Always request liabilities as optional — needed for credit card due dates in Upcoming Payments.
    // Optional so it doesn't block connections for institutions that don't support it.
    if (!optionalProducts.includes('liabilities')) optionalProducts.push('liabilities')

    const linkParams = {
      user: { client_user_id: req.uid },
      client_name: 'Abacus',
      products: required,
      country_codes: ['US'],
      language: 'en',
      transactions: { days_requested: 730 },
    }
    if (optionalProducts.length) linkParams.optional_products = optionalProducts
    const webhookUrl = process.env.PLAID_WEBHOOK_URL
    if (webhookUrl) linkParams.webhook = webhookUrl
    let redirectUri = process.env.PLAID_REDIRECT_URI
    if (redirectUri) {
      // Plaid requires HTTPS for redirect_uri in production (and many OAuth institutions)
      if (process.env.PLAID_ENV === 'production' && redirectUri.toLowerCase().startsWith('http://')) {
        redirectUri = redirectUri.replace(/^http:\/\//i, 'https://')
        console.warn('[plaid] PLAID_REDIRECT_URI was HTTP; using HTTPS for link token. Set PLAID_REDIRECT_URI to an HTTPS URL in production.')
      }
      linkParams.redirect_uri = redirectUri
    }
    console.log('Creating link token with params:', JSON.stringify({ products: linkParams.products, optional_products: linkParams.optional_products, link_mode: linkMode, redirect_uri: linkParams.redirect_uri }))
    const response = await plaidClient.linkTokenCreate(linkParams)
    res.json({ link_token: response.data.link_token })
  } catch (err) {
    const data = err.response?.data
    console.error('Plaid linkTokenCreate error:', data ?? err.message)
    res.status(500).json({ error: data?.error_message ?? 'Failed to create link token' })
  }
})

/** POST /api/plaid/exchange-token — exchange public_token and store item */
plaidRouter.post('/exchange-token', async (req, res, next) => {
  const { public_token, institution_name } = req.body
  if (!public_token) {
    return res.status(400).json({ error: 'Missing public_token' })
  }
  let access_token = null
  try {
    const plaidClient = getPlaidClient()
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token })
    access_token = exchangeRes.data.access_token
    const item_id = exchangeRes.data.item_id

    // Call itemGet to get institution_id and products_granted (one call, two fields)
    const itemRes = await plaidClient.itemGet({ access_token })
    const institution_id = itemRes.data?.item?.institution_id ?? null
    const products_granted = itemRes.data?.item?.billed_products ?? null

    // Duplicate institution check — hard block to prevent double-counting
    if (institution_id) {
      const existing = await getPlaidItemByInstitutionId(req.uid, institution_id)
      if (existing) {
        // Clean up the orphaned access token before rejecting
        await plaidClient.itemRemove({ access_token }).catch((e) =>
          console.error('[exchange-token] itemRemove failed for duplicate:', e.response?.data ?? e.message)
        )
        return res.status(409).json({
          error: 'duplicate_institution',
          institution_name: institution_name || existing.institution_name || 'this institution',
          existing_item_id: existing.item_id,
        })
      }
    }

    // Cache institution_id for logo lookups so /connections doesn't need to call itemGet
    if (item_id && institution_id) itemToInstitutionCache.set(item_id, { institution_id, ts: Date.now() })

    await upsertPlaidItem({
      userId: req.uid,
      itemId: item_id,
      accessToken: access_token,
      institutionName: institution_name || null,
      institutionId: institution_id,
      productsGranted: products_granted,
      lastSyncedAt: new Date(),
    })

    // Run initial sync in the background — don't block the HTTP response.
    // With days_requested: 730, syncing 2 years of history can take many seconds
    // and would time out the HTTP connection. Plaid also fires SYNC_UPDATES_AVAILABLE
    // webhooks as data becomes available, which will trigger incremental syncs.
    syncingItems.add(item_id)
    console.log(`[sync] Starting background initial sync for item ${item_id}`)
    ;(async () => {
      // 1. Cursor-based sync to establish the sync cursor for future incremental updates
      await syncTransactionsForItem(plaidClient, req.uid, item_id, access_token)
      console.log(`[sync] Initial sync complete for item ${item_id}`)
      // 2. Backfill with transactionsGet (2-year lookback) to capture any additional history
      await backfillTransactionsGet(plaidClient, req.uid, item_id, access_token)
      console.log(`[backfill] Initial backfill complete for item ${item_id}`)
    })()
      .catch((err) => console.error(`[sync] Initial sync/backfill failed for item ${item_id}:`, err.response?.data ?? err.message))
      .finally(() => syncingItems.delete(item_id))

    // Snapshot new item with full 2-year investment transaction history
    snapshotInvestments(req.uid, { daysBack: 730 })
      .catch((err) => console.error('[exchange-token] Snapshot failed:', err.message))

    invalidateBalanceCache(req.uid)
    res.json({ success: true })
  } catch (err) {
    // If we have an access_token but something went wrong after exchange, clean it up
    if (access_token) {
      try {
        const plaidClient = getPlaidClient()
        await plaidClient.itemRemove({ access_token })
      } catch (_) {}
    }
    const data = err.response?.data
    const plaidMessage = data?.error_message ?? data?.display_message
    console.error('Plaid exchange error:', plaidMessage ?? err.message, data ?? err)
    res.status(500).json({
      error: plaidMessage ?? (err.code ? 'Database error. Check server logs.' : 'Failed to exchange token'),
    })
  }
})

/** GET /api/plaid/connections — list items with account data (shared cache, accountsGet) */
plaidRouter.get('/connections', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const plaidClient = getPlaidClient()

    async function fetchInstitutionLogo(plaidClient, accessToken, itemId, storedInstitutionId) {
      try {
        let institutionId = storedInstitutionId ?? null
        if (!institutionId) {
          const itemCached = itemId && itemToInstitutionCache.get(itemId)
          if (itemCached && Date.now() - itemCached.ts < ITEM_TO_INSTITUTION_TTL_MS) {
            institutionId = itemCached.institution_id
          } else {
            const itemRes = await plaidClient.itemGet({ access_token: accessToken })
            institutionId = itemRes.data?.item?.institution_id ?? null
            if (itemId && institutionId) itemToInstitutionCache.set(itemId, { institution_id: institutionId, ts: Date.now() })
          }
        }
        if (!institutionId) return null

        const cached = institutionLogoCache.get(institutionId)
        if (cached && Date.now() - cached.ts < LOGO_CACHE_TTL_MS) return cached.logo

        let pending = inflightLogos.get(institutionId)
        if (!pending) {
          pending = (async () => {
            try {
              const instRes = await plaidClient.institutionsGetById({
                institution_id: institutionId,
                country_codes: ['US'],
                options: { include_optional_metadata: true },
              })
              const logo = instRes.data?.institution?.logo
              const dataUrl = logo ? `data:image/png;base64,${logo}` : null
              if (dataUrl) institutionLogoCache.set(institutionId, { logo: dataUrl, ts: Date.now() })
              return dataUrl
            } catch {
              return null
            } finally {
              inflightLogos.delete(institutionId)
            }
          })()
          inflightLogos.set(institutionId, pending)
        }
        return await pending
      } catch {
        return null
      }
    }

    const connections = await Promise.all(
      items.map(async (row) => {
        // Seed from persisted error state — catches cases where sync failed in the background
        let status = row.error_code ? 'error' : 'connected'
        let errorCode = row.error_code ?? null
        let accounts = []

        try {
          accounts = await fetchItemAccounts(plaidClient, req.uid, row)
        } catch (err) {
          const code = err.response?.data?.error_code ?? null
          if (code === 'ITEM_LOGIN_REQUIRED') {
            status = 'error'
            errorCode = code
            setItemErrorCode(req.uid, row.item_id, code).catch(() => {})
          }
        }

        const institutionLogo = await fetchInstitutionLogo(plaidClient, row.access_token, row.item_id, row.institution_id)

        return {
          id: row.id,
          item_id: row.item_id,
          institution_name: row.institution_name ?? 'Unknown',
          institution_logo: institutionLogo ?? undefined,
          products_granted: row.products_granted ?? [],
          status,
          error_code: errorCode,
          last_synced_at: row.last_synced_at,
          syncing: syncingItems.has(row.item_id),
          accounts,
        }
      })
    )

    res.json({ connections })
  } catch (err) {
    console.error('GET /connections error:', err)
    res.status(500).json({ error: 'Failed to load connections' })
  }
})

/** GET /api/plaid/transactions/categories — distinct personal_finance_category values for the user */
plaidRouter.get('/transactions/accounts', async (req, res) => {
  try {
    const accounts = await getTransactionAccounts(req.uid)
    res.json({ accounts })
  } catch (err) {
    console.error('GET /transactions/accounts error:', err)
    res.status(500).json({ error: 'Failed to load accounts' })
  }
})

plaidRouter.get('/transactions/categories', async (req, res) => {
  try {
    const categories = await getTransactionCategories(req.uid)
    res.json({ categories })
  } catch (err) {
    console.error('GET /transactions/categories error:', err)
    res.status(500).json({ error: 'Failed to load categories' })
  }
})

/** PATCH /api/plaid/transactions/:plaidTransactionId/category — override category */
plaidRouter.patch('/transactions/:plaidTransactionId/category', async (req, res) => {
  try {
    const { category, detailed_category } = req.body
    if (!category || !detailed_category) {
      return res.status(400).json({ error: 'category and detailed_category are required' })
    }
    await updateTransactionCategory(req.uid, req.params.plaidTransactionId, category, detailed_category)
    res.json({ ok: true })
  } catch (err) {
    console.error('PATCH /transactions/:id/category error:', err)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

/** PATCH /api/plaid/transactions/:plaidTransactionId/recurring — set recurrence frequency */
plaidRouter.patch('/transactions/:plaidTransactionId/recurring', async (req, res) => {
  try {
    const VALID = ['WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ANNUALLY']
    const { recurring } = req.body
    if (recurring !== null && !VALID.includes(recurring)) {
      return res.status(400).json({ error: `recurring must be one of: ${VALID.join(', ')} or null` })
    }
    await updateTransactionRecurring(req.uid, req.params.plaidTransactionId, recurring)
    res.json({ ok: true })
  } catch (err) {
    console.error('PATCH /transactions/:id/recurring error:', err)
    res.status(500).json({ error: 'Failed to update recurring' })
  }
})

/** GET /api/plaid/transactions — recent transactions across all accounts */
plaidRouter.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500)
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)
    const sort = ['recent', 'oldest', 'amount_desc', 'amount_asc'].includes(req.query.sort)
      ? req.query.sort : 'recent'
    const fromDate = req.query.from_date || null
    const toDate = req.query.to_date || null
    const beforeDate = req.query.before_date || null
    const afterDate = req.query.after_date || null

    // account_ids and categories support both repeated params (?account_ids=a&account_ids=b)
    // and comma-separated (?account_ids=a,b) for backwards compatibility
    const rawAccountIds = [].concat(req.query.account_ids ?? []).flatMap(v => v.split(',')).filter(Boolean)
    const rawCategories = [].concat(req.query.categories ?? []).flatMap(v => v.split(',')).filter(Boolean)
    const rawDetailedCategories = [].concat(req.query.detailed_categories ?? []).flatMap(v => v.split(',')).filter(Boolean)

    const search = req.query.search?.trim() || null

    const opts = { sort, offset }
    if (fromDate && toDate) { opts.fromDate = fromDate; opts.toDate = toDate }
    else if (afterDate && beforeDate) { opts.fromDate = afterDate; opts.toDate = beforeDate }
    else if (afterDate) opts.afterDate = afterDate
    else if (beforeDate) opts.beforeDate = beforeDate
    if (rawAccountIds.length) opts.accountIds = rawAccountIds
    if (rawCategories.length) opts.categories = rawCategories
    if (rawDetailedCategories.length) opts.detailedCategories = rawDetailedCategories
    if (search) opts.search = search

    const { transactions, total } = await getRecentTransactions(req.uid, limit, opts)
    res.json({ transactions, total, has_more: offset + transactions.length < total })
  } catch (err) {
    console.error('GET /transactions error:', err)
    res.status(500).json({ error: 'Failed to load transactions' })
  }
})

/** GET /api/plaid/recurring — upcoming payments: recurring streams + credit card bills (liabilities) */
plaidRouter.get('/recurring', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const plaidClient = getPlaidClient()
    const toAmount = (v) => (v == null ? 0 : typeof v === 'number' ? v : v.amount ?? 0)
    const itemResults = await Promise.all(items.map(async (row) => {
      const itemPayments = []

      const [recurringResult, liabResult] = await Promise.allSettled([
        plaidClient.transactionsRecurringGet({
          access_token: row.access_token,
          options: { personal_finance_category_version: 'v2' },
        }),
        plaidClient.liabilitiesGet({ access_token: row.access_token }),
      ])

      if (recurringResult.status === 'fulfilled') {
        const outflowStreams = recurringResult.value.data?.outflow_streams ?? []
        for (const stream of outflowStreams) {
          if (!stream.predicted_next_date) continue
          const status = stream.status ?? 'UNKNOWN'
          if (status === 'TOMBSTONED') continue
          const pfc = stream.personal_finance_category ?? stream.personalFinanceCategory
          const primary = typeof pfc === 'string' ? pfc : pfc?.primary ?? null
          const counterpartyLogo = stream.counterparties?.[0]?.logo_url ?? stream.counterparties?.[0]?.logoUrl
          const logoUrl = stream.logo_url ?? stream.logoUrl ?? counterpartyLogo ?? null
          itemPayments.push({
            stream_id: stream.stream_id,
            first_transaction_id: stream.transaction_ids?.[0] ?? null,
            merchant_name: stream.merchant_name ?? stream.description ?? 'Unknown',
            description: stream.description ?? null,
            logo_url: logoUrl,
            frequency: stream.frequency ?? 'UNKNOWN',
            average_amount: toAmount(stream.average_amount),
            last_amount: toAmount(stream.last_amount),
            predicted_next_date: stream.predicted_next_date,
            first_date: stream.first_date ?? stream.firstDate ?? null,
            last_date: stream.last_date ?? stream.lastDate ?? null,
            category: stream.category ?? null,
            personal_finance_category_primary: primary,
            status,
            source: 'recurring',
          })
        }
      } else {
        const code = recurringResult.reason?.response?.data?.error_code
        if (code !== 'PRODUCT_NOT_READY' && code !== 'PRODUCT_NOT_SUPPORTED') {
          console.warn('[plaid] recurring get for item failed:', recurringResult.reason?.message)
        }
      }

      if (liabResult.status === 'fulfilled') {
        const accounts = liabResult.value.data?.accounts ?? []
        const accountByName = Object.fromEntries(accounts.map((a) => [a.account_id, a.official_name || a.name || 'Credit card']))
        const creditLiabs = liabResult.value.data?.liabilities?.credit ?? []
        for (const credit of creditLiabs) {
          const due = credit.next_payment_due_date ?? credit.nextPaymentDueDate
          if (!due) continue
          const accountId = credit.account_id ?? credit.accountId
          const name = accountByName[accountId] ?? 'Credit card'
          const minAmount = credit.minimum_payment_amount ?? credit.minimumPaymentAmount ?? 0
          itemPayments.push({
            stream_id: `liability-${accountId}`,
            first_transaction_id: null,
            merchant_name: name,
            description: null,
            logo_url: null,
            frequency: 'MONTHLY',
            average_amount: minAmount,
            last_amount: minAmount,
            predicted_next_date: due,
            first_date: null,
            last_date: null,
            category: null,
            personal_finance_category_primary: null,
            status: 'ACTIVE',
            source: 'liability',
          })
        }
      } else {
        const code = liabResult.reason?.response?.data?.error_code
        if (code !== 'PRODUCT_NOT_READY' && code !== 'PRODUCT_NOT_SUPPORTED' && code !== 'PRODUCT_NOT_ENABLED') {
          console.warn('[plaid] liabilities get for item failed:', liabResult.reason?.message)
        }
      }

      return itemPayments
    }))

    const today = todayET() // YYYY-MM-DD
    const plaidPayments = itemResults.flat().filter((p) => p.predicted_next_date >= today)

    // Enrich Plaid payment logos
    const transactionIds = [...new Set(plaidPayments.map((p) => p.first_transaction_id).filter(Boolean))]
    const logoMap = transactionIds.length ? await getLogoUrlsByPlaidTransactionIds(req.uid, transactionIds) : {}
    for (const p of plaidPayments) {
      if (p.first_transaction_id && logoMap[p.first_transaction_id]) p.logo_url = logoMap[p.first_transaction_id]
      delete p.first_transaction_id
    }

    // Add user-marked subscription payments from the database
    const FREQUENCY_DAYS = { WEEKLY: 7, BIWEEKLY: 14, SEMI_MONTHLY: 15, MONTHLY: 30, QUARTERLY: 91, YEARLY: 365, ANNUALLY: 365 }
    const subscriptionRows = await getSubscriptionPayments(req.uid)
    const subscriptionPayments = []
    for (const row of subscriptionRows) {
      const freqDays = FREQUENCY_DAYS[row.recurring] ?? 30
      // row.date may be a Date object or a string — normalize to YYYY-MM-DD string first
      const dateStr = row.date instanceof Date ? toDateStrET(row.date) : String(row.date).slice(0, 10)
      const lastDate = new Date(dateStr + 'T00:00:00')
      // Project forward from last transaction date until we find the next future date
      let nextDate = new Date(lastDate)
      while (toDateStrET(nextDate) < today) {
        nextDate.setDate(nextDate.getDate() + freqDays)
      }
      const predictedNext = toDateStrET(nextDate)
      subscriptionPayments.push({
        stream_id: `sub-${row.plaid_transaction_id}`,
        merchant_name: row.merchant_name || row.name || 'Unknown',
        description: row.name,
        logo_url: row.logo_url ?? null,
        frequency: row.recurring,
        average_amount: Math.abs(row.amount),
        last_amount: Math.abs(row.amount),
        predicted_next_date: predictedNext,
        first_date: dateStr,
        last_date: dateStr,
        category: null,
        personal_finance_category_primary: 'SUBSCRIPTION',
        status: 'ACTIVE',
        source: 'subscription',
      })
    }

    // Deduplicate: skip subscription entries that match a Plaid payment on amount, frequency, and category
    const plaidKeys = new Set(plaidPayments.map((p) => {
      const amt = Math.round((p.last_amount ?? p.average_amount ?? 0) * 100)
      return `${amt}|${p.frequency}|${p.personal_finance_category_primary ?? ''}`
    }))
    const dedupedSubs = subscriptionPayments.filter((s) => {
      const amt = Math.round((s.last_amount ?? 0) * 100)
      const key = `${amt}|${s.frequency}|${s.personal_finance_category_primary ?? ''}`
      return !plaidKeys.has(key)
    })

    const payments = [...plaidPayments, ...dedupedSubs]
    payments.sort((a, b) => (a.predicted_next_date || '').localeCompare(b.predicted_next_date || ''))
    res.json({ payments })
  } catch (err) {
    console.error('GET /recurring error:', err)
    res.status(500).json({ error: 'Failed to load recurring payments' })
  }
})

/** GET /api/plaid/cash-flow — monthly inflows, outflows, and net (last N months) */
plaidRouter.get('/cash-flow', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 24)
    const rows = await getMonthlyCashFlow(req.uid, months)
    res.json({ months: rows })
  } catch (err) {
    console.error('GET /cash-flow error:', err)
    res.status(500).json({ error: 'Failed to load cash flow' })
  }
})

/** GET /api/plaid/cash-flow-time-series — cash flow grouped by day/week/month within a date range */
plaidRouter.get('/cash-flow-time-series', async (req, res, next) => {
  try {
    const { start_date, end_date, granularity } = req.query
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' })
    if (granularity && !['day', 'week', 'month'].includes(granularity)) {
      return res.status(400).json({ error: 'granularity must be day, week, or month' })
    }
    const rows = await getCashFlowTimeSeries(req.uid, start_date, end_date, granularity || 'month')
    res.json({ buckets: rows })
  } catch (err) {
    console.error('GET /cash-flow-time-series error:', err)
    res.status(500).json({ error: 'Failed to load cash flow time series' })
  }
})

/** GET /api/plaid/cash-flow-transactions — inflows and outflows for a month or date range */
plaidRouter.get('/cash-flow-transactions', async (req, res, next) => {
  try {
    const { month, start_date, end_date } = req.query
    if (start_date && end_date) {
      const result = await getCashFlowTransactions(req.uid, null, start_date, end_date)
      return res.json(result)
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Provide month (YYYY-MM) or start_date + end_date (YYYY-MM-DD)' })
    }
    const result = await getCashFlowTransactions(req.uid, month)
    res.json(result)
  } catch (err) {
    console.error('GET /cash-flow-transactions error:', err)
    res.status(500).json({ error: 'Failed to load cash flow transactions' })
  }
})

/** GET /api/plaid/cash-flow-breakdown — category-level cash flow for Sankey diagram */
plaidRouter.get('/cash-flow-breakdown', async (req, res, next) => {
  try {
    const period = req.query.period
    if (!period || !['week', 'month', 'quarter', 'ytd', 'year', 'custom'].includes(period)) {
      return res.status(400).json({ error: 'period must be week, month, quarter, year, or custom' })
    }
    let customRange = null
    if (period === 'custom') {
      const { start_date, end_date } = req.query
      if (!start_date || !end_date) return res.status(400).json({ error: 'custom period requires start_date and end_date' })
      customRange = { startDate: start_date, endDate: end_date }
    }
    const breakdown = req.query.breakdown || 'category'
    if (!['category', 'group', 'merchant'].includes(breakdown)) {
      return res.status(400).json({ error: 'breakdown must be category, group, or merchant' })
    }
    const accountIds = req.query.account_ids ? req.query.account_ids.split(',').filter(Boolean) : null
    const excludeCategories = req.query.exclude_categories ? req.query.exclude_categories.split(',').filter(Boolean) : []
    const rows = await getCashFlowBreakdown(req.uid, period, breakdown, accountIds, customRange)

    // Map primary categories to their group names for filtering
    const CATEGORY_GROUP_NAMES = {
      RENT_AND_UTILITIES: 'Bills & Utilities',
    }
    const excludeGroupNames = new Set(excludeCategories.map(c => CATEGORY_GROUP_NAMES[c]).filter(Boolean))
    const excludePrimarySet = new Set(excludeCategories)

    const income = { total: 0, categories: [] }
    const expenses = { total: 0, categories: [] }
    for (const r of rows) {
      // Skip excluded categories (match both raw primary and group names)
      if (excludePrimarySet.has(r.category_key) || excludeGroupNames.has(r.category_key)) continue
      const entry = { name: r.category_key, amount: r.total_amount }
      if (r.flow_type === 'income') {
        income.total += r.total_amount
        income.categories.push(entry)
      } else {
        expenses.total += r.total_amount
        expenses.categories.push(entry)
      }
    }

    res.json({ period, breakdown, income, expenses })
  } catch (err) {
    console.error('GET /cash-flow-breakdown error:', err)
    res.status(500).json({ error: 'Failed to load cash flow breakdown' })
  }
})

/** GET /api/plaid/cash-flow-node-transactions — transactions for a Sankey node drill-down */
plaidRouter.get('/cash-flow-node-transactions', async (req, res, next) => {
  try {
    const { period, breakdown, flow_type, category_key } = req.query
    if (!period || !['week', 'month', 'quarter', 'ytd', 'year', 'custom'].includes(period)) {
      return res.status(400).json({ error: 'period must be week, month, quarter, year, or custom' })
    }
    let customRange = null
    if (period === 'custom') {
      const { start_date, end_date } = req.query
      if (!start_date || !end_date) return res.status(400).json({ error: 'custom period requires start_date and end_date' })
      customRange = { startDate: start_date, endDate: end_date }
    }
    if (!flow_type || !['income', 'expense'].includes(flow_type)) {
      return res.status(400).json({ error: 'flow_type must be income or expense' })
    }
    if (!category_key) {
      return res.status(400).json({ error: 'category_key is required' })
    }
    const accountIds = req.query.account_ids ? req.query.account_ids.split(',').filter(Boolean) : null
    const rows = await getCashFlowNodeTransactions(req.uid, period, breakdown || 'category', flow_type, category_key, accountIds, customRange)
    res.json({ transactions: rows })
  } catch (err) {
    console.error('GET /cash-flow-node-transactions error:', err)
    res.status(500).json({ error: 'Failed to load transactions' })
  }
})

/** GET /api/plaid/spending-summary — aggregated spending for charts, broken down by account */
plaidRouter.get('/spending-summary', async (req, res, next) => {
  try {
    const period = req.query.period
    if (!period || !['week', 'month', 'year'].includes(period)) {
      return res.status(400).json({ error: 'period must be week, month, or year' })
    }
    const accountIds = req.query.account_ids ? req.query.account_ids.split(',').filter(Boolean) : null
    const excludeCategories = req.query.exclude_categories ? req.query.exclude_categories.split(',').filter(Boolean) : []
    const rows = await getSpendingSummaryByAccount(req.uid, period, accountIds, excludeCategories)

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const today = new Date()

    const accountSet = new Set()
    const bucketMap = {}
    for (const r of rows) {
      const name = r.account_name
      accountSet.add(name)
      if (!bucketMap[r.bucket]) bucketMap[r.bucket] = {}
      bucketMap[r.bucket][name] = (bucketMap[r.bucket][name] || 0) + (parseFloat(r.total) || 0)
    }
    const accounts = [...accountSet].sort()

    let allKeys = []
    if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        allKeys.push(toDateStrET(d))
      }
    } else if (period === 'month') {
      for (let i = 3; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i * 7)
        const day = d.getDay()
        d.setDate(d.getDate() - day + 1)
        allKeys.push(toDateStrET(d))
      }
      allKeys = [...new Set(allKeys)]
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        allKeys.push(toDateStrET(d).slice(0, 7))
      }
    }

    const buckets = allKeys.map((key) => {
      let label = key
      if (period === 'week') {
        const d = new Date(key + 'T00:00:00')
        label = DAY_NAMES[d.getDay()] || key
      } else if (period === 'month') {
        const start = new Date(key + 'T00:00:00')
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        const startStr = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`
        const endStr = start.getMonth() === end.getMonth()
          ? `${end.getDate()}`
          : `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}`
        label = `${startStr}–${endStr}`
      } else {
        const [y, m] = key.split('-')
        label = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
      }
      const entry = { label, date: key }
      const perAccount = bucketMap[key] || {}
      for (const name of accounts) {
        // Clamp to 0: refunds can make a bucket net-negative; show as $0, not a negative bar
        entry[name] = Math.max(0, perAccount[name] ?? 0)
      }
      return entry
    })

    res.json({ period, accounts, buckets })
  } catch (err) {
    console.error('GET /spending-summary error:', err)
    res.status(500).json({ error: 'Failed to load spending summary' })
  }
})

/** POST /api/plaid/sync — sync all items for the current user */
plaidRouter.post('/sync', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    if (items.length === 0) return res.json({ synced: 0 })

    const fullResync = req.body?.full_resync === true
    if (fullResync) {
      for (const row of items) await clearSyncCursor(req.uid, row.item_id)
    }

    const plaidClient = getPlaidClient()
    let synced = 0
    await Promise.allSettled(
      items.map(async (row) => {
        try {
          await syncTransactionsForItem(plaidClient, req.uid, row.item_id, row.access_token)
          itemCache.delete(row.item_id)
          inflight.delete(row.item_id)
          if (row.error_code) await clearItemErrorCode(req.uid, row.item_id)
          synced++
        } catch (err) {
          const code = err.response?.data?.error_code ?? null
          console.error(`Auto-sync failed for item ${row.item_id}:`, err.response?.data ?? err.message)
          if (code === 'ITEM_LOGIN_REQUIRED') {
            await setItemErrorCode(req.uid, row.item_id, code).catch(() => {})
          }
        }
      })
    )
    console.log(`POST /sync — ${synced}/${items.length} items synced for user ${req.uid}${fullResync ? ' (full resync)' : ''}`)
    res.json({ synced, total: items.length })
  } catch (err) {
    console.error('POST /sync error:', err)
    res.status(500).json({ error: 'Sync failed' })
  }
})

/** POST /api/plaid/refresh — request Plaid to refresh transactions, then re-sync + real-time balance */
plaidRouter.post('/refresh', async (req, res, next) => {
  const { item_id } = req.body
  if (!item_id) {
    return res.status(400).json({ error: 'Missing item_id' })
  }
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const item = items.find((i) => i.item_id === item_id)
    if (!item) {
      return res.status(404).json({ error: 'Connection not found' })
    }
    const plaidClient = getPlaidClient()
    try {
      await plaidClient.transactionsRefresh({ access_token: item.access_token })
    } catch (refreshErr) {
      const code = refreshErr.response?.data?.error_code
      if (code !== 'PRODUCT_NOT_READY' && code !== 'PRODUCT_NOT_SUPPORTED') {
        console.warn('[plaid] transactions/refresh failed (continuing with sync):', refreshErr.response?.data ?? refreshErr.message)
      }
    }
    await syncTransactionsForItem(plaidClient, req.uid, item.item_id, item.access_token)

    itemCache.delete(item_id)
    inflight.delete(item_id)
    try {
      await fetchItemAccounts(plaidClient, req.uid, item, true)
    } catch (_) {}

    res.json({ success: true })
  } catch (err) {
    const data = err.response?.data
    const code = data?.error_code
    console.error('POST /refresh error:', data ?? err.message)
    if (code === 'ITEM_LOGIN_REQUIRED') {
      return res.status(400).json({ error: 'Login required', error_code: 'ITEM_LOGIN_REQUIRED' })
    }
    res.status(500).json({ error: 'Failed to refresh connection' })
  }
})

/** POST /api/plaid/backfill — pull older transactions via transactionsGet with explicit 2-year date range */
plaidRouter.post('/backfill', async (req, res, next) => {
  const { item_id } = req.body
  if (!item_id) return res.status(400).json({ error: 'Missing item_id' })
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const item = items.find(i => i.item_id === item_id)
    if (!item) return res.status(404).json({ error: 'Connection not found' })

    const plaidClient = getPlaidClient()
    const totalFetched = await backfillTransactionsGet(plaidClient, req.uid, item_id, item.access_token)
    res.json({ success: true, transactions_fetched: totalFetched })
  } catch (err) {
    const data = err.response?.data
    console.error('POST /backfill error:', data ?? err.message)
    res.status(500).json({ error: 'Failed to backfill transactions' })
  }
})

/** POST /api/plaid/link-token/update — create link token in update mode for reconnecting */
plaidRouter.post('/link-token/update', async (req, res, next) => {
  const { item_id } = req.body
  if (!item_id) {
    return res.status(400).json({ error: 'Missing item_id' })
  }
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const item = items.find((i) => i.item_id === item_id)
    if (!item) {
      return res.status(404).json({ error: 'Connection not found' })
    }
    const plaidClient = getPlaidClient()
    const linkParams = {
      user: { client_user_id: req.uid },
      client_name: 'Abacus',
      access_token: item.access_token,
      country_codes: ['US'],
      language: 'en',
    }
    const webhookUrlUpdate = process.env.PLAID_WEBHOOK_URL
    if (webhookUrlUpdate) linkParams.webhook = webhookUrlUpdate
    let redirectUriUpdate = process.env.PLAID_REDIRECT_URI
    if (redirectUriUpdate) {
      if (process.env.PLAID_ENV === 'production' && redirectUriUpdate.toLowerCase().startsWith('http://')) {
        redirectUriUpdate = redirectUriUpdate.replace(/^http:\/\//i, 'https://')
        console.warn('[plaid] PLAID_REDIRECT_URI was HTTP; using HTTPS for update link token.')
      }
      linkParams.redirect_uri = redirectUriUpdate
    }
    const response = await plaidClient.linkTokenCreate(linkParams)
    res.json({ link_token: response.data.link_token })
  } catch (err) {
    const data = err.response?.data
    console.error('Plaid linkTokenCreate (update) error:', data ?? err.message)
    res.status(500).json({ error: data?.error_message ?? 'Failed to create update link token' })
  }
})

/** POST /api/plaid/disconnect — remove a Plaid item and revoke access */
plaidRouter.post('/disconnect', async (req, res, next) => {
  const { item_id } = req.body
  if (!item_id) {
    return res.status(400).json({ error: 'Missing item_id' })
  }
  try {
    const deleted = await deletePlaidItem(req.uid, item_id)
    if (!deleted) {
      return res.status(404).json({ error: 'Connection not found' })
    }
    try {
      const plaidClient = getPlaidClient()
      await plaidClient.itemRemove({ access_token: deleted.access_token })
    } catch (err) {
      console.error('Plaid itemRemove failed (item already deleted from DB):', err.response?.data ?? err.message)
    }
    invalidateBalanceCache(req.uid)
    res.json({ success: true })
  } catch (err) {
    console.error('POST /disconnect error:', err)
    res.status(500).json({ error: 'Failed to disconnect' })
  }
})

/** GET /api/plaid/investments — holdings across all connected investment accounts */
plaidRouter.get('/investments', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const plaidClient = getPlaidClient()
    const allHoldings = []
    const failedItems = []

    for (const row of items) {
      try {
        const holdRes = await plaidClient.investmentsHoldingsGet({ access_token: row.access_token })
        const accountMap = {}
        for (const a of holdRes.data.accounts ?? []) {
          accountMap[a.account_id] = a.name || a.official_name || 'Account'
        }
        const securityMap = {}
        for (const s of holdRes.data.securities ?? []) {
          securityMap[s.security_id] = {
            name: s.name || 'Unknown Security',
            ticker: s.ticker_symbol || null,
            type: s.type || null,
            close_price: s.close_price ?? null,
          }
        }
        for (const h of holdRes.data.holdings ?? []) {
          const sec = securityMap[h.security_id] || {}
          allHoldings.push({
            item_id: row.item_id,
            account_id: h.account_id,
            institution_name: row.institution_name ?? 'Unknown',
            account_name: accountMap[h.account_id] ?? 'Account',
            security_name: sec.name ?? 'Unknown',
            ticker: sec.ticker ?? null,
            security_type: sec.type ?? null,
            quantity: h.quantity ?? 0,
            institution_price: h.institution_price ?? null,
            institution_price_as_of: h.institution_price_as_of ?? null,
            close_price: sec.close_price ?? null,
            value: h.institution_value ?? (h.quantity ?? 0) * (sec.close_price ?? 0),
            cost_basis: h.cost_basis ?? null,
          })
        }
      } catch (err) {
        const code = err.response?.data?.error_code
        const SILENT_CODES = ['PRODUCTS_NOT_SUPPORTED', 'NO_INVESTMENT_ACCOUNTS', 'CONSENT_NOT_GRANTED', 'ADDITIONAL_CONSENT_REQUIRED']
        const PERSIST_ERROR_CODES = ['ITEM_LOGIN_REQUIRED', 'NO_ACCOUNTS']
        if (SILENT_CODES.includes(code)) {
          console.log(`Investments skipped for item ${row.item_id} (${row.institution_name}): ${code}`)
          continue
        }
        if (PERSIST_ERROR_CODES.includes(code)) {
          console.log(`Investments error for item ${row.item_id} (${row.institution_name}): ${code}`)
          setItemErrorCode(req.uid, row.item_id, code).catch(() => {})
          failedItems.push({ item_id: row.item_id, institution_name: row.institution_name ?? 'Unknown', error_code: code })
          continue
        }
        console.error(`Investments get failed for item ${row.item_id}:`, err.response?.data ?? err.message)
        failedItems.push({ item_id: row.item_id, institution_name: row.institution_name ?? 'Unknown', error_code: code ?? 'UNKNOWN' })
      }
    }

    res.json({ holdings: allHoldings, failedItems })
  } catch (err) {
    console.error('GET /investments error:', err)
    res.status(500).json({ error: 'Failed to load investments' })
  }
})

/** GET /api/plaid/investment-transactions — trade history for a specific account */
plaidRouter.get('/investment-transactions', async (req, res, next) => {
  try {
    const { account_id } = req.query
    if (!account_id) return res.status(400).json({ error: 'account_id is required' })
    const txns = await getInvestmentTransactionsByAccount(req.uid, account_id)
    res.json({ transactions: txns })
  } catch (err) {
    console.error('GET /investment-transactions error:', err)
    res.status(500).json({ error: 'Failed to load investment transactions' })
  }
})

/** GET /api/plaid/ticker-transactions — trade history for a specific ticker across all accounts */
plaidRouter.get('/ticker-transactions', async (req, res, next) => {
  try {
    const { ticker } = req.query
    if (!ticker) return res.status(400).json({ error: 'ticker is required' })
    const txns = await getInvestmentTransactionsByTicker(req.uid, ticker)
    res.json({ transactions: txns })
  } catch (err) {
    console.error('GET /ticker-transactions error:', err)
    res.status(500).json({ error: 'Failed to load ticker transactions' })
  }
})

/** GET /api/plaid/investment-history — historical investment portfolio value */
plaidRouter.get('/investment-history', async (req, res, next) => {
  try {
    const VALID_RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']
    const range = (req.query.range || '').toUpperCase()
    if (!VALID_RANGES.includes(range)) {
      return res.status(400).json({ error: 'range must be one of: 1W, 1M, 3M, YTD, 1Y, ALL' })
    }

    const today = new Date()
    const todayStr = todayET()

    let sinceDate
    if (range === '1W') {
      const d = new Date(today); d.setDate(d.getDate() - 7); sinceDate = toDateStrET(d)
    } else if (range === '1M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); sinceDate = toDateStrET(d)
    } else if (range === '3M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); sinceDate = toDateStrET(d)
    } else if (range === 'YTD') {
      sinceDate = `${todayStr.slice(0, 4)}-01-01`
    } else if (range === '1Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); sinceDate = toDateStrET(d)
    } else {
      const earliest = await getEarliestTransactionDate(req.uid)
      sinceDate = earliest || toDateStrET(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()))
    }

    const [allAccounts, txns] = await Promise.all([
      getAllUserAccounts(req.uid),
      getTransactionsForNetWorth(req.uid, sinceDate),
    ])
    let investmentAccounts = allAccounts.filter((a) => a.type === 'investment')

    const accountIdsParam = req.query.account_ids
    if (accountIdsParam) {
      const filterSet = new Set(accountIdsParam.split(',').map((s) => s.trim()).filter(Boolean))
      investmentAccounts = investmentAccounts.filter((a) => filterSet.has(a.account_id))
    }

    if (investmentAccounts.length === 0) {
      return res.json({ range, current: { value: 0 }, history: [] })
    }

    const currentValue = investmentAccounts.reduce((s, a) => s + a.current, 0)
    const investmentIds = new Set(investmentAccounts.map((a) => a.account_id))
    const investTxns = txns.filter((t) => investmentIds.has(t.account_id))

    const txnsByAccount = {}
    for (const t of investTxns) {
      if (!txnsByAccount[t.account_id]) txnsByAccount[t.account_id] = []
      txnsByAccount[t.account_id].push({ date: t.date.slice(0, 10), amount: parseFloat(t.amount) })
    }

    const startD = new Date(sinceDate + 'T00:00:00')
    const endD = new Date(todayStr + 'T00:00:00')
    const dayStrings = []
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      dayStrings.push(toDateStrET(d))
    }

    const accountDailyBalances = {}
    for (const acc of investmentAccounts) {
      const accTxns = txnsByAccount[acc.account_id] || []

      if (accTxns.length === 0) {
        accountDailyBalances[acc.account_id] = {}
        for (const day of dayStrings) accountDailyBalances[acc.account_id][day] = acc.current
        continue
      }

      const txnSumByDate = {}
      for (const t of accTxns) txnSumByDate[t.date] = (txnSumByDate[t.date] || 0) + t.amount

      const balances = {}
      let cumulativeAfter = 0
      for (let i = dayStrings.length - 1; i >= 0; i--) {
        const day = dayStrings[i]
        balances[day] = acc.current + cumulativeAfter
        if (txnSumByDate[day]) cumulativeAfter += txnSumByDate[day]
      }
      accountDailyBalances[acc.account_id] = balances
    }

    const history = dayStrings.map((day) => {
      let value = 0
      for (const acc of investmentAccounts) {
        value += accountDailyBalances[acc.account_id]?.[day] ?? 0
      }
      return { date: day, value: Math.round(value * 100) / 100 }
    })

    res.json({
      range,
      current: { value: Math.round(currentValue * 100) / 100 },
      history,
    })
  } catch (err) {
    console.error('GET /investment-history error:', err)
    res.status(500).json({ error: 'Failed to load investment history' })
  }
})

/** GET /api/plaid/net-worth-history — historical net worth from daily balance snapshots */
plaidRouter.get('/net-worth-history', async (req, res, next) => {
  try {
    const VALID_RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']
    const range = (req.query.range || '').toUpperCase()
    if (!VALID_RANGES.includes(range)) {
      return res.status(400).json({ error: 'range must be one of: 1W, 1M, 3M, YTD, 1Y, ALL' })
    }

    const today = new Date()
    const todayStr = todayET()

    let afterDate
    if (range === '1W') {
      const d = new Date(today); d.setDate(d.getDate() - 7); afterDate = toDateStrET(d)
    } else if (range === '1M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); afterDate = toDateStrET(d)
    } else if (range === '3M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); afterDate = toDateStrET(d)
    } else if (range === 'YTD') {
      afterDate = `${todayStr.slice(0, 4)}-01-01`
    } else if (range === '1Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); afterDate = toDateStrET(d)
    } else {
      afterDate = null // ALL — no lower bound
    }

    const ASSET_TYPES = new Set(['depository', 'investment'])
    const DEBT_TYPES = new Set(['credit', 'loan'])

    // Fetch balance history for depository/credit/loan from snapshots,
    // and per-date investment account values from portfolio_account_snapshots
    const [balanceRows, investmentRows] = await Promise.all([
      getAccountBalanceHistory(req.uid, { afterDate: afterDate ?? undefined }),
      getInvestmentBalanceHistory(req.uid, { afterDate: afterDate ?? undefined }),
    ])

    if (balanceRows.length === 0 && investmentRows.length === 0) {
      return res.json({ range, accounts: [], current: { assets: 0, debts: 0, net_worth: 0 }, history: [] })
    }

    // Build per-account metadata for the dropdown filter
    const accountMetaMap = {}
    for (const row of balanceRows) {
      if (!accountMetaMap[row.account_id]) {
        accountMetaMap[row.account_id] = {
          account_id: row.account_id,
          name: row.account_name,
          type: row.type,
          subtype: row.subtype,
          institution_name: row.institution_name,
        }
      }
    }
    for (const row of investmentRows) {
      if (!accountMetaMap[row.account_id]) {
        accountMetaMap[row.account_id] = {
          account_id: row.account_id,
          name: row.account_name,
          type: 'investment',
          subtype: null,
          institution_name: row.institution_name,
        }
      }
    }

    // Group balance history by date then account (skip investment — those come from portfolio snapshots)
    const byDate = {}
    for (const row of balanceRows) {
      if (row.type === 'investment') continue
      const d = row.date instanceof Date ? toDateStrET(row.date) : String(row.date).slice(0, 10)
      if (!byDate[d]) byDate[d] = {}
      byDate[d][row.account_id] = { current: parseFloat(row.current ?? 0), type: row.type }
    }

    // Group investment history by date then account (from portfolio_account_snapshots)
    for (const row of investmentRows) {
      const d = row.date instanceof Date ? toDateStrET(row.date) : String(row.date).slice(0, 10)
      if (!byDate[d]) byDate[d] = {}
      byDate[d][row.account_id] = { current: row.current, type: 'investment' }
    }

    const allDates = Object.keys(byDate).sort()

    const history = allDates.map((day) => {
      let assets = 0
      let debts = 0
      const by_account = {}

      for (const [accountId, { current, type }] of Object.entries(byDate[day])) {
        if (ASSET_TYPES.has(type)) {
          assets += current
          by_account[accountId] = Math.round(current * 100) / 100
        } else if (DEBT_TYPES.has(type)) {
          debts += Math.abs(current)
          by_account[accountId] = Math.round(-Math.abs(current) * 100) / 100
        }
      }

      return {
        date: day,
        assets: Math.round(assets * 100) / 100,
        debts: Math.round(debts * 100) / 100,
        net_worth: Math.round((assets - debts) * 100) / 100,
        by_account,
      }
    })

    // Current totals: live Plaid balances (not snapshots)
    const liveAccounts = await getAllUserAccounts(req.uid)
    let currentAssets = 0, currentDebts = 0
    const todayByAccount = {}
    for (const acc of liveAccounts) {
      const val = parseFloat(acc.current ?? 0)
      if (ASSET_TYPES.has(acc.type)) {
        currentAssets += val
        todayByAccount[acc.account_id] = Math.round(val * 100) / 100
      } else if (DEBT_TYPES.has(acc.type)) {
        currentDebts += Math.abs(val)
        todayByAccount[acc.account_id] = Math.round(-Math.abs(val) * 100) / 100
      }
    }

    // Replace or append today's data point with live values
    const todayEntry = {
      date: todayStr,
      assets: Math.round(currentAssets * 100) / 100,
      debts: Math.round(currentDebts * 100) / 100,
      net_worth: Math.round((currentAssets - currentDebts) * 100) / 100,
      by_account: todayByAccount,
    }
    if (history.length && history[history.length - 1].date === todayStr) {
      history[history.length - 1] = todayEntry
    } else {
      history.push(todayEntry)
    }

    res.json({
      range,
      accounts: Object.values(accountMetaMap),
      current: {
        assets: todayEntry.assets,
        debts: todayEntry.debts,
        net_worth: todayEntry.net_worth,
      },
      history,
    })
  } catch (err) {
    console.error('GET /net-worth-history error:', err)
    res.status(500).json({ error: 'Failed to load net worth history' })
  }
})

const INTRADAY_MARKET_HOLIDAYS = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
  '2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
])

function getMostRecentTradingDay(fromDateStr) {
  const d = new Date(fromDateStr + 'T12:00:00Z')
  d.setDate(d.getDate() - 1)
  for (let i = 0; i < 10; i++) {
    const s = toDateStrET(d)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6 && !INTRADAY_MARKET_HOLIDAYS.has(s)) return s
    d.setDate(d.getDate() - 1)
  }
  return fromDateStr
}

/** GET /api/plaid/portfolio-history — real portfolio value from snapshots, not back-calculation */
plaidRouter.get('/portfolio-history', async (req, res) => {
  try {
    const VALID_RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL']
    const range = (req.query.range || '').toUpperCase()
    if (!VALID_RANGES.includes(range)) {
      return res.status(400).json({ error: 'range must be one of: 1D, 1W, 1M, 3M, YTD, 1Y, ALL' })
    }

    const today = new Date()
    const todayStr = todayET()

    // ── 1D: intraday portfolio value from Yahoo Finance 5m bars ─────────
    if (range === '1D') {
      const etStr = today.toLocaleString('en-US', { timeZone: 'America/New_York' })
      const et = new Date(etStr)
      const etDow = et.getDay()
      const etDateStr = todayStr
      const etTotalMin = et.getHours() * 60 + et.getMinutes()
      const isWeekend = etDow === 0 || etDow === 6
      const isHoliday = INTRADAY_MARKET_HOLIDAYS.has(etDateStr)
      const marketHasStartedToday = !isWeekend && !isHoliday && etTotalMin >= 570 // 9:30am ET

      const tradingDateStr = marketHasStartedToday ? etDateStr : getMostRecentTradingDay(etDateStr)

      const latestHoldings = await getLatestHoldingsSnapshot(req.uid)
      const accountIdsParam = req.query.account_ids
      let filteredHoldings = latestHoldings
      if (accountIdsParam) {
        const filterSet = new Set(accountIdsParam.split(',').map((s) => s.trim()).filter(Boolean))
        filteredHoldings = latestHoldings.filter((h) => filterSet.has(h.account_id))
      }

      // Aggregate quantities per ticker (filter out cash/non-priced securities)
      // Track unpriced holdings (cash, money market, etc.) as a constant baseline
      const tickerQuantities = {}
      let unpricedBaseline = 0
      for (const h of filteredHoldings) {
        if (!h.ticker || h.ticker.startsWith('CUR:') || !h.quantity) {
          unpricedBaseline += parseFloat(h.value ?? 0)
          continue
        }
        tickerQuantities[h.ticker] = (tickerQuantities[h.ticker] || 0) + parseFloat(h.quantity)
      }

      const tickers = Object.keys(tickerQuantities)
      if (!tickers.length) {
        return res.json({ range: '1D', isIntraday: true, tradingDate: tradingDateStr, current: { value: unpricedBaseline }, history: [] })
      }

      // Fetch intraday 5m bars from Yahoo Finance for each ticker
      // Use new Date() as period2 to avoid future-date parsing issues with yahoo-finance2
      const intradayPeriod2 = new Date()

      const chartResults = await Promise.allSettled(
        tickers.map((ticker) =>
          yahooFinance.chart(ticker, { period1: tradingDateStr, period2: intradayPeriod2, interval: '5m' }, { validateResult: false })
            .then((result) => ({
              ticker,
              quotes: (result?.quotes ?? []).filter((q) => (q.close ?? q.adjclose ?? q.open) != null),
            }))
        )
      )

      // Build sorted price series per ticker
      const tickerPrices = {}
      for (const r of chartResults) {
        if (r.status !== 'fulfilled') continue
        const { ticker, quotes } = r.value
        tickerPrices[ticker] = quotes
          .filter((q) => {
            // Strip pre-market and after-hours — keep only 9:30am–4:00pm ET
            const etStr = new Date(q.date).toLocaleString('en-US', { timeZone: 'America/New_York' })
            const et = new Date(etStr)
            const min = et.getHours() * 60 + et.getMinutes()
            return min >= 570 && min < 960
          })
          .map((q) => ({ ts: new Date(q.date).getTime(), price: q.close ?? q.adjclose ?? q.open }))
          .sort((a, b) => a.ts - b.ts)
      }

      // Collect all unique timestamps across all tickers
      const allTs = [...new Set(
        Object.values(tickerPrices).flatMap((pts) => pts.map((p) => p.ts))
      )].sort((a, b) => a - b)

      if (!allTs.length) {
        return res.json({ range: '1D', isIntraday: true, tradingDate: tradingDateStr, current: { value: 0 }, history: [] })
      }

      // For each timestamp compute portfolio value — use last-known price (forward-fill) per ticker
      // Add unpricedBaseline (cash, money market, etc.) to each point so 1D matches daily snapshots
      const history = allTs.map((ts) => {
        let value = unpricedBaseline
        for (const [ticker, qty] of Object.entries(tickerQuantities)) {
          const pts = tickerPrices[ticker]
          if (!pts) continue
          let price = null
          for (const p of pts) {
            if (p.ts <= ts) price = p.price
            else break
          }
          if (price != null) value += qty * price
        }
        return { date: new Date(ts).toISOString(), value: Math.round(value * 100) / 100 }
      })

      const currentValue = history.length ? history[history.length - 1].value : 0
      return res.json({
        range: '1D',
        isIntraday: true,
        tradingDate: tradingDateStr,
        current: { value: currentValue },
        history,
      })
    }

    // ── Daily-range: snapshot-based history ──────────────────────────────
    // Only call Plaid once per day — skip if a live snapshot already exists for today.
    // Pass today as a string to avoid DB timezone mismatches.
    const alreadySnapshotted = await hasTodaySnapshot(req.uid, todayStr)
    if (!alreadySnapshotted) {
      await snapshotInvestments(req.uid)
    }

    let sinceDate
    if (range === '1W') {
      const d = new Date(today); d.setDate(d.getDate() - 7); sinceDate = toDateStrET(d)
    } else if (range === '1M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); sinceDate = toDateStrET(d)
    } else if (range === '3M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); sinceDate = toDateStrET(d)
    } else if (range === 'YTD') {
      sinceDate = `${todayStr.slice(0, 4)}-01-01`
    } else if (range === '1Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); sinceDate = toDateStrET(d)
    } else {
      sinceDate = '2000-01-01' // ALL: return everything we have
    }

    const accountIdsParam = req.query.account_ids
    const historyPromise = accountIdsParam
      ? getPortfolioAccountHistory(req.uid, sinceDate, accountIdsParam.split(',').map((s) => s.trim()).filter(Boolean))
      : getPortfolioHistory(req.uid, sinceDate)

    const [history, latestValue] = await Promise.all([historyPromise, getLatestPortfolioValue(req.uid)])

    res.json({
      range,
      current: latestValue != null ? { value: latestValue } : null,
      history,
    })
  } catch (err) {
    console.error('GET /portfolio-history error:', err)
    res.status(500).json({ error: 'Failed to load portfolio history' })
  }
})

/** GET /api/plaid/portfolio-snapshot?date=YYYY-MM-DD — holdings detail for a specific snapshot date */
plaidRouter.get('/portfolio-snapshot', async (req, res) => {
  const { date } = req.query
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' })
  }
  try {
    const holdings = await getHoldingsSnapshotForDate(req.uid, date)
    const total = holdings.reduce((s, h) => s + (h.value ?? 0), 0)

    const accountMap = {}
    for (const h of holdings) {
      const key = `${h.institution}|${h.account_name}`
      if (!accountMap[key]) accountMap[key] = { account_name: h.account_name, institution: h.institution, value: 0 }
      accountMap[key].value += h.value ?? 0
    }
    const accounts = Object.values(accountMap).sort((a, b) => b.value - a.value)

    res.json({ date, total, accounts, holdings })
  } catch (err) {
    console.error('GET /portfolio-snapshot error:', err)
    res.status(500).json({ error: 'Failed to load snapshot' })
  }
})

/** GET /api/plaid/ticker-history?tickers=VOO,PLTR&range=1D|1W|1M|3M|YTD|1Y|ALL — Yahoo Finance price history for movers chart */
plaidRouter.get('/ticker-history', async (req, res) => {
  try {
    const VALID_RANGES = ['1D', '5D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL']
    const range = (req.query.range || '1Y').toUpperCase()
    if (!VALID_RANGES.includes(range)) {
      return res.status(400).json({ error: 'range must be one of: 1D, 5D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y, ALL' })
    }
    const tickers = (req.query.tickers || '').split(',').map(t => t.trim()).filter(Boolean)
    if (!tickers.length) return res.json({ range, series: [] })

    const today = new Date()

    // ── 1D: intraday 5m bars for the current (or last) trading session ──
    if (range === '1D') {
      const etStr = today.toLocaleString('en-US', { timeZone: 'America/New_York' })
      const et = new Date(etStr)
      const etDow = et.getDay()
      const etDateStr = todayET()
      const etTotalMin = et.getHours() * 60 + et.getMinutes()
      const isWeekend = etDow === 0 || etDow === 6
      const isHoliday = INTRADAY_MARKET_HOLIDAYS.has(etDateStr)
      const marketHasStartedToday = !isWeekend && !isHoliday && etTotalMin >= 570

      const tradingDateStr = marketHasStartedToday ? etDateStr : getMostRecentTradingDay(etDateStr)
      // Use current time as period2 — avoids future-date issues with yahoo-finance2 parsing
      // and naturally covers the full session for past trading days too
      const period2 = new Date()

      const results = await Promise.allSettled(
        tickers.map(async (ticker) => {
          const result = await yahooFinance.chart(ticker, {
            period1: tradingDateStr,
            period2,
            interval: '5m',
          }, { validateResult: false })
          const data = (result?.quotes ?? [])
            .map(q => ({
              date: new Date(q.date).toISOString(),
              price: q.close ?? q.adjclose ?? q.open ?? null,
            }))
            .filter(p => {
              if (p.price == null) return false
              // Strip pre-market and after-hours — keep only 9:30am–4:00pm ET
              const etStr = new Date(p.date).toLocaleString('en-US', { timeZone: 'America/New_York' })
              const et = new Date(etStr)
              const min = et.getHours() * 60 + et.getMinutes()
              return min >= 570 && min < 960
            })
          return { ticker, data }
        })
      )

      const series = results
        .filter(r => r.status === 'fulfilled' && r.value.data.length > 0)
        .map(r => r.value)

      if (series.length === 0) {
        console.warn(`[ticker-history 1D] Empty series for tickers: ${tickers.join(',')} tradingDate: ${tradingDateStr}`)
      }

      return res.json({ range, isIntraday: true, tradingDate: tradingDateStr, series })
    }

    // ── Daily ranges ────────────────────────────────────────────────────
    let sinceDate
    if (range === '5D') {
      const d = new Date(today); d.setDate(d.getDate() - 5); sinceDate = toDateStrET(d)
    } else if (range === '1W') {
      const d = new Date(today); d.setDate(d.getDate() - 7); sinceDate = toDateStrET(d)
    } else if (range === '1M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); sinceDate = toDateStrET(d)
    } else if (range === '3M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); sinceDate = toDateStrET(d)
    } else if (range === '6M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 6); sinceDate = toDateStrET(d)
    } else if (range === 'YTD') {
      sinceDate = `${todayET().slice(0, 4)}-01-01`
    } else if (range === '1Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); sinceDate = toDateStrET(d)
    } else if (range === '5Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 5); sinceDate = toDateStrET(d)
    } else {
      sinceDate = '1990-01-01'
    }

    const results = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const result = await yahooFinance.chart(ticker, {
          period1: sinceDate,
          period2: toDateStrET(today),
          interval: '1d',
        }, { validateResult: false })
        const data = (result?.quotes ?? [])
          .filter(q => q.adjclose != null)
          .map(q => ({
            date: toDateStrET(new Date(q.date)),
            price: q.adjclose,
          }))
        return { ticker, data }
      })
    )

    const series = results
      .filter(r => r.status === 'fulfilled' && r.value.data.length > 0)
      .map(r => r.value)

    res.json({ range, series })
  } catch (err) {
    console.error('GET /ticker-history error:', err)
    res.status(500).json({ error: 'Failed to load ticker history' })
  }
})

/** GET /api/plaid/quotes?tickers=VOO,PLTR — live Yahoo Finance quotes */
plaidRouter.get('/quotes', async (req, res) => {
  try {
    const tickers = (req.query.tickers || '').split(',').map(t => t.trim()).filter(Boolean)
    if (!tickers.length) return res.json({ quotes: [] })

    const results = await Promise.allSettled(
      tickers.map(ticker =>
        yahooFinance.quote(ticker, {}, { validateResult: false }).then(q => ({
          ticker,
          name: q.shortName || q.longName || ticker,
          price: q.regularMarketPrice ?? null,
          prevClose: q.regularMarketPreviousClose ?? null,
          change: q.regularMarketChange ?? null,
          changePct: q.regularMarketChangePercent ?? null,
          marketState: q.marketState ?? null, // REGULAR, PRE, POST, CLOSED
          week52Low: q.fiftyTwoWeekLow ?? null,
          week52High: q.fiftyTwoWeekHigh ?? null,
          marketCap: q.marketCap ?? null,
          peRatio: q.trailingPE ?? null,
          eps: q.epsTrailingTwelveMonths ?? null,
          earningsDate: q.earningsTimestamp ? toDateStrET(new Date(q.earningsTimestamp)) : (q.earningsTimestampStart ? toDateStrET(new Date(q.earningsTimestampStart)) : null),
        }))
      )
    )

    const quotes = results
      .filter(r => r.status === 'fulfilled' && r.value.price != null)
      .map(r => r.value)

    res.json({ quotes })
  } catch (err) {
    console.error('GET /quotes error:', err)
    res.status(500).json({ error: 'Failed to load quotes' })
  }
})

/** GET /api/plaid/accounts — all accounts across all connections (shared cache) */
plaidRouter.get('/accounts', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const plaidClient = getPlaidClient()
    const allAccounts = []

    await Promise.all(
      items.map(async (row) => {
        try {
          const accounts = await fetchItemAccounts(plaidClient, req.uid, row)
          for (const acc of accounts) {
            allAccounts.push({
              ...acc,
              item_id: row.item_id,
              institution_name: row.institution_name ?? 'Unknown',
              last_synced_at: row.last_synced_at ?? null,
            })
          }
        } catch (err) {
          console.error(`Accounts get failed for item ${row.item_id}:`, err.response?.data ?? err.message)
        }
      })
    )

    res.json({ accounts: allAccounts })
  } catch (err) {
    console.error('GET /accounts error:', err)
    res.status(500).json({ error: 'Failed to load accounts' })
  }
})

/** Plaid webhook handler — mount without auth at POST /api/plaid/webhook with express.raw() so req.body is Buffer.
 *  Verifies Plaid-Verification JWT (signature + body hash); only then syncs on SYNC_UPDATES_AVAILABLE. */
export async function plaidWebhookHandler(req, res) {
  const rawBody = req.body
  if (!Buffer.isBuffer(rawBody)) {
    res.status(200).json({ ok: true })
    return
  }
  const verificationHeader = req.headers['plaid-verification'] ?? req.headers['Plaid-Verification']
  const { valid } = await verifyPlaidWebhook(rawBody, verificationHeader)
  res.status(200).json({ ok: true })
  if (!valid) return

  let body
  try {
    body = JSON.parse(rawBody.toString('utf8'))
  } catch (_) {
    return
  }
  const { webhook_type, webhook_code, item_id } = body
  if (webhook_type !== 'TRANSACTIONS' || webhook_code !== 'SYNC_UPDATES_AVAILABLE' || !item_id) {
    return
  }
  const item = await getPlaidItemByItemId(item_id)
  if (!item) return
  const plaidClient = getPlaidClient()
  syncTransactionsForItem(plaidClient, item.user_id, item.item_id, item.access_token)
    .then(() => {
      itemCache.delete(item_id)
      inflight.delete(item_id)
      console.log(`[plaid webhook] Synced item ${item_id} for user ${item.user_id}`)
    })
    .catch((err) => {
      console.error(`[plaid webhook] Sync failed for item ${item_id}:`, err.response?.data ?? err.message)
    })
}
