import { Router } from 'express'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import {
  getPlaidItemsByUserId, upsertPlaidItem, deletePlaidItem, updateAccountsCache,
  getSyncCursor, updateSyncCursor, upsertTransactions, deleteTransactionsByPlaidIds,
  getRecentTransactions, getSpendingSummaryByAccount, getTransactionsForNetWorth, getEarliestTransactionDate,
  updateTransactionAccountNames,
} from '../db.js'

/* ── Unified per-item account cache with request deduplication ────── */

const CACHE_TTL_MS = 5 * 60 * 1000
const FAIL_TTL_MS = 60 * 1000
const itemCache = new Map()
const inflight = new Map()
const userItemIndex = new Map()

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

async function _callPlaid(plaidClient, userId, row, useBalanceGet) {
  try {
    const res = useBalanceGet
      ? await plaidClient.accountsBalanceGet({ access_token: row.access_token })
      : await plaidClient.accountsGet({ access_token: row.access_token })
    const accounts = mapPlaidAccounts(res.data.accounts)
    itemCache.set(row.item_id, { ts: Date.now(), accounts })
    updateAccountsCache(userId, row.item_id, accounts).catch(() => {})
    return { accounts, error: null }
  } catch (err) {
    const code = err.response?.data?.error_code ?? null
    if (useBalanceGet && code === 'BALANCE_LIMIT') {
      try {
        const fallback = await plaidClient.accountsGet({ access_token: row.access_token })
        const accounts = mapPlaidAccounts(fallback.data.accounts)
        itemCache.set(row.item_id, { ts: Date.now(), accounts })
        updateAccountsCache(userId, row.item_id, accounts).catch(() => {})
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

function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID ?? ''
  const secret = process.env.PLAID_SECRET ?? ''
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase()
  const basePath = env === 'production'
    ? PlaidEnvironments.production
    : env === 'development'
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox
  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  return new PlaidApi(configuration)
}

/* ── Transaction sync helper ─────────────────────────────────────── */

async function syncTransactionsForItem(plaidClient, userId, itemId, accessToken) {
  let cursor = await getSyncCursor(userId, itemId)
  let hasMore = true

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
    const request = { access_token: accessToken, ...(cursor ? { cursor } : {}) }
    const res = await plaidClient.transactionsSync(request)
    const { added, modified, removed, next_cursor, has_more } = res.data

    const toUpsert = [...added, ...modified].map((t) => ({
      account_id: t.account_id,
      transaction_id: t.transaction_id,
      name: t.name || t.merchant_name || 'Transaction',
      amount: t.amount,
      date: t.date,
      account_name: accountNames[t.account_id] ?? null,
      payment_channel: t.payment_channel ?? null,
      personal_finance_category: t.personal_finance_category?.primary ?? null,
    }))
    if (toUpsert.length) await upsertTransactions(userId, itemId, toUpsert)

    const toRemove = (removed ?? []).map((r) => r.transaction_id)
    if (toRemove.length) await deleteTransactionsByPlaidIds(toRemove)

    cursor = next_cursor
    hasMore = has_more
  }

  await updateSyncCursor(userId, itemId, cursor)
}

/* ── Routes ──────────────────────────────────────────────────────── */

export const plaidRouter = Router()

/** POST /api/plaid/link-token — create link token for Plaid Link */
plaidRouter.post('/link-token', async (req, res, next) => {
  try {
    const plaidClient = getPlaidClient()
    const envProducts = (process.env.PLAID_PRODUCTS || 'transactions').split(',').map((p) => p.trim())
    const requiredSet = new Set([...envProducts, 'investments'])
    const required = [...requiredSet]

    const linkParams = {
      user: { client_user_id: req.uid },
      client_name: 'Crumbs Money',
      products: required,
      country_codes: ['US'],
      language: 'en',
    }
    if (process.env.PLAID_REDIRECT_URI) linkParams.redirect_uri = process.env.PLAID_REDIRECT_URI
    console.log('Creating link token with params:', JSON.stringify({ products: linkParams.products, redirect_uri: linkParams.redirect_uri }))
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
  try {
    const plaidClient = getPlaidClient()
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token })
    const { access_token, item_id } = exchangeRes.data

    await upsertPlaidItem({
      userId: req.uid,
      itemId: item_id,
      accessToken: access_token,
      institutionName: institution_name || null,
      lastSyncedAt: new Date(),
    })

    try {
      await syncTransactionsForItem(plaidClient, req.uid, item_id, access_token)
    } catch (syncErr) {
      console.error('Initial transaction sync failed (non-blocking):', syncErr.response?.data ?? syncErr.message)
    }

    invalidateBalanceCache(req.uid)
    res.json({ success: true })
  } catch (err) {
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

    const connections = await Promise.all(
      items.map(async (row) => {
        let status = 'connected'
        let errorCode = null
        let accounts = []

        try {
          accounts = await fetchItemAccounts(plaidClient, req.uid, row)
        } catch (err) {
          const code = err.response?.data?.error_code ?? null
          if (code === 'ITEM_LOGIN_REQUIRED') {
            status = 'error'
            errorCode = code
          }
        }

        return {
          id: row.id,
          item_id: row.item_id,
          institution_name: row.institution_name ?? 'Unknown',
          status,
          error_code: errorCode,
          last_synced_at: row.last_synced_at,
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

/** GET /api/plaid/transactions — recent transactions across all accounts */
plaidRouter.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100)
    const rows = await getRecentTransactions(req.uid, limit)
    res.json({ transactions: rows })
  } catch (err) {
    console.error('GET /transactions error:', err)
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
    const rows = await getSpendingSummaryByAccount(req.uid, period, accountIds)

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const pad = (n) => String(n).padStart(2, '0')
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
        allKeys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
      }
    } else if (period === 'month') {
      for (let i = 3; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i * 7)
        const day = d.getDay()
        d.setDate(d.getDate() - day + 1)
        allKeys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
      }
      allKeys = [...new Set(allKeys)]
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        allKeys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
      }
    }

    const buckets = allKeys.map((key) => {
      let label = key
      if (period === 'week') {
        const d = new Date(key + 'T00:00:00')
        label = DAY_NAMES[d.getDay()] || key
      } else if (period === 'month') {
        const d = new Date(key + 'T00:00:00')
        label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
      } else {
        const [y, m] = key.split('-')
        label = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`
      }
      const entry = { label, date: key }
      const perAccount = bucketMap[key] || {}
      for (const name of accounts) {
        entry[name] = perAccount[name] ?? 0
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

    const plaidClient = getPlaidClient()
    let synced = 0
    await Promise.allSettled(
      items.map(async (row) => {
        try {
          await syncTransactionsForItem(plaidClient, req.uid, row.item_id, row.access_token)
          itemCache.delete(row.item_id)
          inflight.delete(row.item_id)
          synced++
        } catch (err) {
          console.error(`Auto-sync failed for item ${row.item_id}:`, err.response?.data ?? err.message)
        }
      })
    )
    console.log(`POST /sync — ${synced}/${items.length} items synced for user ${req.uid}`)
    res.json({ synced })
  } catch (err) {
    console.error('POST /sync error:', err)
    res.status(500).json({ error: 'Sync failed' })
  }
})

/** POST /api/plaid/refresh — re-sync transactions + real-time balance for a connection */
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
      client_name: 'Crumbs Money',
      access_token: item.access_token,
      country_codes: ['US'],
      language: 'en',
    }
    if (process.env.PLAID_REDIRECT_URI) linkParams.redirect_uri = process.env.PLAID_REDIRECT_URI
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
            close_price: sec.close_price ?? null,
            value: h.institution_value ?? (h.quantity ?? 0) * (sec.close_price ?? 0),
            cost_basis: h.cost_basis ?? null,
          })
        }
      } catch (err) {
        const code = err.response?.data?.error_code
        const SKIP_CODES = ['PRODUCTS_NOT_SUPPORTED', 'NO_INVESTMENT_ACCOUNTS', 'CONSENT_NOT_GRANTED', 'ADDITIONAL_CONSENT_REQUIRED', 'ITEM_LOGIN_REQUIRED']
        if (SKIP_CODES.includes(code)) {
          console.log(`Investments skipped for item ${row.item_id} (${row.institution_name}): ${code}`)
          continue
        }
        console.error(`Investments get failed for item ${row.item_id}:`, err.response?.data ?? err.message)
      }
    }

    res.json({ holdings: allHoldings })
  } catch (err) {
    console.error('GET /investments error:', err)
    res.status(500).json({ error: 'Failed to load investments' })
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
    const pad = (n) => String(n).padStart(2, '0')
    const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todayStr = toDateStr(today)

    let sinceDate
    if (range === '1W') {
      const d = new Date(today); d.setDate(d.getDate() - 7); sinceDate = toDateStr(d)
    } else if (range === '1M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); sinceDate = toDateStr(d)
    } else if (range === '3M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); sinceDate = toDateStr(d)
    } else if (range === 'YTD') {
      sinceDate = `${today.getFullYear()}-01-01`
    } else if (range === '1Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); sinceDate = toDateStr(d)
    } else {
      const earliest = await getEarliestTransactionDate(req.uid)
      sinceDate = earliest || toDateStr(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()))
    }

    const allAccounts = await getAllUserAccounts(req.uid)
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

    const txns = await getTransactionsForNetWorth(req.uid, sinceDate)
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
      dayStrings.push(toDateStr(d))
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

/** GET /api/plaid/net-worth-history — historical net worth via back-calculation */
plaidRouter.get('/net-worth-history', async (req, res, next) => {
  try {
    const VALID_RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']
    const range = (req.query.range || '').toUpperCase()
    if (!VALID_RANGES.includes(range)) {
      return res.status(400).json({ error: 'range must be one of: 1W, 1M, 3M, YTD, 1Y, ALL' })
    }

    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todayStr = toDateStr(today)

    let sinceDate
    if (range === '1W') {
      const d = new Date(today); d.setDate(d.getDate() - 7); sinceDate = toDateStr(d)
    } else if (range === '1M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); sinceDate = toDateStr(d)
    } else if (range === '3M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); sinceDate = toDateStr(d)
    } else if (range === 'YTD') {
      sinceDate = `${today.getFullYear()}-01-01`
    } else if (range === '1Y') {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); sinceDate = toDateStr(d)
    } else {
      const earliest = await getEarliestTransactionDate(req.uid)
      sinceDate = earliest || toDateStr(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()))
    }

    const allAccounts = await getAllUserAccounts(req.uid)

    if (allAccounts.length === 0) {
      return res.json({ range, current: { assets: 0, debts: 0, net_worth: 0 }, history: [] })
    }

    const ASSET_TYPES = new Set(['depository', 'investment'])
    const DEBT_TYPES = new Set(['credit', 'loan'])
    const BACK_CALC_TYPES = new Set(['depository', 'credit', 'loan'])

    const txns = await getTransactionsForNetWorth(req.uid, sinceDate)

    const txnsByAccount = {}
    for (const t of txns) {
      if (!txnsByAccount[t.account_id]) txnsByAccount[t.account_id] = []
      txnsByAccount[t.account_id].push({ date: t.date.slice(0, 10), amount: parseFloat(t.amount) })
    }

    const startD = new Date(sinceDate + 'T00:00:00')
    const endD = new Date(todayStr + 'T00:00:00')
    const dayStrings = []
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      dayStrings.push(toDateStr(d))
    }

    const accountDailyBalances = {}
    for (const acc of allAccounts) {
      const canBackCalc = BACK_CALC_TYPES.has(acc.type)
      const accTxns = txnsByAccount[acc.account_id] || []

      if (!canBackCalc || accTxns.length === 0) {
        accountDailyBalances[acc.account_id] = { type: acc.type, balances: {} }
        for (const day of dayStrings) {
          accountDailyBalances[acc.account_id].balances[day] = acc.current
        }
        continue
      }

      const txnSumByDate = {}
      for (const t of accTxns) {
        txnSumByDate[t.date] = (txnSumByDate[t.date] || 0) + t.amount
      }

      const balances = {}
      let cumulativeAfter = 0
      for (let i = dayStrings.length - 1; i >= 0; i--) {
        const day = dayStrings[i]
        balances[day] = acc.current + cumulativeAfter
        if (txnSumByDate[day]) {
          cumulativeAfter += txnSumByDate[day]
        }
      }

      accountDailyBalances[acc.account_id] = { type: acc.type, balances }
    }

    const history = dayStrings.map((day) => {
      let assets = 0
      let debts = 0

      for (const acc of allAccounts) {
        const bal = accountDailyBalances[acc.account_id]?.balances[day] ?? 0
        if (ASSET_TYPES.has(acc.type)) {
          assets += bal
        } else if (DEBT_TYPES.has(acc.type)) {
          debts += Math.abs(bal)
        }
      }

      return {
        date: day,
        assets: Math.round(assets * 100) / 100,
        debts: Math.round(debts * 100) / 100,
        net_worth: Math.round((assets - debts) * 100) / 100,
      }
    })

    const currentAssets = allAccounts
      .filter((a) => ASSET_TYPES.has(a.type))
      .reduce((s, a) => s + a.current, 0)
    const currentDebts = allAccounts
      .filter((a) => DEBT_TYPES.has(a.type))
      .reduce((s, a) => s + Math.abs(a.current), 0)

    res.json({
      range,
      current: {
        assets: Math.round(currentAssets * 100) / 100,
        debts: Math.round(currentDebts * 100) / 100,
        net_worth: Math.round((currentAssets - currentDebts) * 100) / 100,
      },
      history,
    })
  } catch (err) {
    console.error('GET /net-worth-history error:', err)
    res.status(500).json({ error: 'Failed to load net worth history' })
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
