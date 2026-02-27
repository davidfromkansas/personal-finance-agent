import { Router } from 'express'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import {
  getPlaidItemsByUserId, upsertPlaidItem, deletePlaidItem,
  getSyncCursor, updateSyncCursor, upsertTransactions, deleteTransactionsByPlaidIds,
  getRecentTransactions,
} from '../db.js'

function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID ?? ''
  const secret = process.env.PLAID_SECRET ?? ''
  const configuration = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  return new PlaidApi(configuration)
}

async function syncTransactionsForItem(plaidClient, userId, itemId, accessToken) {
  let cursor = await getSyncCursor(userId, itemId)
  let hasMore = true

  let accountNames = {}
  try {
    const acctRes = await plaidClient.accountsGet({ access_token: accessToken })
    for (const a of acctRes.data.accounts ?? []) {
      accountNames[a.account_id] = a.name || a.official_name || a.subtype || 'Account'
    }
  } catch (_) {}

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
    }))
    if (toUpsert.length) await upsertTransactions(userId, itemId, toUpsert)

    const toRemove = (removed ?? []).map((r) => r.transaction_id)
    if (toRemove.length) await deleteTransactionsByPlaidIds(toRemove)

    cursor = next_cursor
    hasMore = has_more
  }

  await updateSyncCursor(userId, itemId, cursor)
}

export const plaidRouter = Router()

/** POST /api/plaid/link-token — create link token for Plaid Link */
plaidRouter.post('/link-token', async (req, res, next) => {
  try {
    const plaidClient = getPlaidClient()
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.uid },
      client_name: 'Copilot',
      products: ['transactions', 'investments'],
      country_codes: ['US'],
      language: 'en',
    })
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

/** GET /api/plaid/connections — list items with live balance from Plaid */
plaidRouter.get('/connections', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const connections = []

    for (const row of items) {
      let status = 'connected'
      let errorCode = null
      let accounts = []

      try {
        const plaidClient = getPlaidClient()
        const balanceRes = await plaidClient.accountsBalanceGet({ access_token: row.access_token })
        accounts = (balanceRes.data.accounts ?? []).map((acc) => ({
          account_id: acc.account_id,
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype ?? null,
          current: acc.balances?.current ?? null,
          available: acc.balances?.available ?? null,
        }))
      } catch (err) {
        status = 'error'
        errorCode = err.response?.data?.error_code ?? null
        console.error(`Plaid balance get failed for item ${row.item_id}:`, err.response?.data ?? err.message)
      }

      connections.push({
        id: row.id,
        item_id: row.item_id,
        institution_name: row.institution_name ?? 'Unknown',
        status,
        error_code: errorCode,
        last_synced_at: row.last_synced_at,
        accounts,
      })
    }

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

/** POST /api/plaid/refresh — re-sync transactions for a connection */
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
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.uid },
      client_name: 'Copilot',
      access_token: item.access_token,
      country_codes: ['US'],
      language: 'en',
    })
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
        if (code === 'PRODUCTS_NOT_SUPPORTED' || code === 'NO_INVESTMENT_ACCOUNTS') continue
        console.error(`Investments get failed for item ${row.item_id}:`, err.response?.data ?? err.message)
      }
    }

    res.json({ holdings: allHoldings })
  } catch (err) {
    console.error('GET /investments error:', err)
    res.status(500).json({ error: 'Failed to load investments' })
  }
})

/** GET /api/plaid/accounts — all accounts across all connections with balances */
plaidRouter.get('/accounts', async (req, res, next) => {
  try {
    const items = await getPlaidItemsByUserId(req.uid)
    const plaidClient = getPlaidClient()
    const allAccounts = []

    for (const row of items) {
      try {
        const balRes = await plaidClient.accountsBalanceGet({ access_token: row.access_token })
        for (const acc of balRes.data.accounts ?? []) {
          allAccounts.push({
            item_id: row.item_id,
            institution_name: row.institution_name ?? 'Unknown',
            account_id: acc.account_id,
            name: acc.name || acc.official_name || 'Account',
            type: acc.type,
            subtype: acc.subtype ?? null,
            current: acc.balances?.current ?? null,
            available: acc.balances?.available ?? null,
            currency: acc.balances?.iso_currency_code ?? 'USD',
          })
        }
      } catch (err) {
        console.error(`Accounts get failed for item ${row.item_id}:`, err.response?.data ?? err.message)
      }
    }

    res.json({ accounts: allAccounts })
  } catch (err) {
    console.error('GET /accounts error:', err)
    res.status(500).json({ error: 'Failed to load accounts' })
  }
})
