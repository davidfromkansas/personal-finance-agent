import pg from 'pg'
import { hashFirebaseUid, encrypt, decrypt, encryptNum, decryptNum, encryptJSON, decryptJSON, encryptBool, decryptBool, decryptRow, decryptRows } from './lib/crypto.js'
import { toDateStrET } from './lib/dateUtils.js'

const { Pool } = pg

/**
 * Postgres access layer. All functions take userId (from req.uid); no ORM.
 * Used by server/routes/plaid.js for plaid_items, transactions, and aggregations.
 * Run migrations with: node server/run-migration.js
 *
 * ENCRYPTION: Most columns are encrypted at the app layer (AES-256-GCM).
 * Only dates, Plaid IDs, user_id (opaque UUID), and lot_index remain plaintext.
 * Do NOT add SQL WHERE/GROUP BY/SUM on encrypted columns — filter in JS after decrypting.
 */

// ── Encryption field specs (field name → type for decryptRow/decryptRows) ────
const PLAID_ITEM_FIELDS = {
  access_token: 'string', institution_name: 'string', accounts_cache: 'json',
  error_code: 'string', products_granted: 'string', sync_cursor: 'string',
}

const TX_FIELDS = {
  name: 'string', amount: 'number', account_name: 'string', payment_channel: 'string',
  personal_finance_category: 'string', pending: 'bool', logo_url: 'string',
  original_description: 'string', merchant_name: 'string', location: 'json',
  website: 'string', personal_finance_category_detailed: 'string',
  personal_finance_category_confidence: 'string', counterparties: 'json',
  payment_meta: 'json', check_number: 'string', recurring: 'string',
}

const HOLDING_FIELDS = {
  account_name: 'string', institution: 'string', ticker: 'string',
  security_name: 'string', security_type: 'string', quantity: 'number',
  price: 'number', value: 'number', cost_basis: 'number', currency: 'string', source: 'string',
}

const INV_TX_FIELDS = {
  institution: 'string', account_name: 'string', ticker: 'string',
  security_name: 'string', security_type: 'string', quantity: 'number',
  price: 'number', amount: 'number', fees: 'number', type: 'string',
  subtype: 'string', currency: 'string',
}

const BALANCE_FIELDS = {
  account_name: 'string', institution_name: 'string', current: 'number',
  available: 'number', credit_limit: 'number', type: 'string',
  subtype: 'string', currency: 'string',
}

const PORTFOLIO_SNAPSHOT_FIELDS = {
  total_value: 'number', source: 'string', unavailable_items: 'json',
}

const PORTFOLIO_ACCT_FIELDS = {
  account_name: 'string', institution: 'string', value: 'number', source: 'string',
}
let pool = null

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set. Add it to server/.env')
    pool = new Pool({ connectionString: url })
    pool.on('error', (err) => {
      console.error('[pg pool] idle client error:', err.message)
    })
  }
  return pool
}

export async function query(text, params) {
  const client = await getPool().connect()
  client.on('error', (err) => {
    console.error('[pg client] connection error:', err.message)
  })
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

/**
 * Maps a Firebase UID to an opaque internal UUID. Creates the mapping on first login.
 * Used by auth middleware so req.uid is always the opaque UUID.
 */
export async function resolveUserId(firebaseUid) {
  const hash = hashFirebaseUid(firebaseUid)
  const { rows } = await query(`SELECT id FROM users WHERE firebase_uid_hash = $1`, [hash])
  if (rows.length > 0) return rows[0].id
  const encrypted = encrypt(firebaseUid)
  const { rows: inserted } = await query(
    `INSERT INTO users (firebase_uid_hash, firebase_uid_encrypted)
     VALUES ($1, $2)
     ON CONFLICT (firebase_uid_hash) DO UPDATE SET firebase_uid_hash = EXCLUDED.firebase_uid_hash
     RETURNING id`,
    [hash, encrypted]
  )
  return inserted[0].id
}

export async function getPlaidItemByItemId(itemId) {
  const { rows } = await query(
    `SELECT id, user_id, item_id, access_token, institution_name, last_synced_at, created_at, accounts_cache
     FROM plaid_items WHERE item_id = $1 LIMIT 1`,
    [itemId]
  )
  return rows[0] ? decryptRow(rows[0], PLAID_ITEM_FIELDS) : null
}

export async function getPlaidItemsByUserId(userId) {
  const { rows } = await query(
    `SELECT id, user_id, item_id, access_token, institution_name, institution_id, products_granted, last_synced_at, created_at, accounts_cache, error_code
     FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  )
  return decryptRows(rows, PLAID_ITEM_FIELDS)
}

export async function getPlaidItemByInstitutionId(userId, institutionId) {
  const { rows } = await query(
    `SELECT item_id, institution_name FROM plaid_items WHERE user_id = $1 AND institution_id = $2 LIMIT 1`,
    [userId, institutionId]
  )
  return rows[0] ? decryptRow(rows[0], PLAID_ITEM_FIELDS) : null
}

export async function updateAccountsCache(userId, itemId, accountsJson) {
  await query(
    `UPDATE plaid_items SET accounts_cache = $3 WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId, encryptJSON(accountsJson)]
  )
}

export async function upsertPlaidItem({ userId, itemId, accessToken, institutionName, institutionId, productsGranted, lastSyncedAt }) {
  await query(
    `INSERT INTO plaid_items (user_id, item_id, access_token, institution_name, institution_id, products_granted, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, item_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       institution_name = COALESCE(EXCLUDED.institution_name, plaid_items.institution_name),
       institution_id = COALESCE(EXCLUDED.institution_id, plaid_items.institution_id),
       products_granted = COALESCE(EXCLUDED.products_granted, plaid_items.products_granted),
       last_synced_at = COALESCE(EXCLUDED.last_synced_at, plaid_items.last_synced_at)`,
    [userId, itemId, encrypt(accessToken), encrypt(institutionName ?? null), institutionId ?? null, encrypt(productsGranted ?? null), lastSyncedAt ?? new Date()]
  )
}

export async function deletePlaidItem(userId, itemId) {
  await Promise.all([
    query(`DELETE FROM transactions WHERE user_id = $1 AND item_id = $2`, [userId, itemId]),
    query(`DELETE FROM account_balance_snapshots WHERE user_id = $1 AND item_id = $2`, [userId, itemId]),
    query(`DELETE FROM portfolio_account_snapshots WHERE user_id = $1 AND item_id = $2`, [userId, itemId]),
    query(`DELETE FROM holdings_snapshots WHERE user_id = $1 AND item_id = $2`, [userId, itemId]),
    query(`DELETE FROM investment_transactions WHERE user_id = $1 AND item_id = $2`, [userId, itemId]),
  ])
  const { rows } = await query(
    `DELETE FROM plaid_items WHERE user_id = $1 AND item_id = $2 RETURNING access_token`,
    [userId, itemId]
  )
  return rows[0] ? decryptRow(rows[0], PLAID_ITEM_FIELDS) : null
}

export async function getSyncCursor(userId, itemId) {
  const { rows } = await query(
    `SELECT sync_cursor FROM plaid_items WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId]
  )
  return rows[0]?.sync_cursor ? decrypt(rows[0].sync_cursor) : null
}

export async function updateSyncCursor(userId, itemId, cursor) {
  await query(
    `UPDATE plaid_items SET sync_cursor = $3, last_synced_at = NOW() WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId, encrypt(cursor)]
  )
}

export async function setItemErrorCode(userId, itemId, errorCode) {
  await query(
    `UPDATE plaid_items SET error_code = $3 WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId, encrypt(errorCode)]
  )
}

export async function clearItemErrorCode(userId, itemId) {
  await query(
    `UPDATE plaid_items SET error_code = NULL WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId]
  )
}

/** Clear sync cursor so next sync re-fetches full history (e.g. to backfill logo_url). */
export async function clearSyncCursor(userId, itemId) {
  await query(
    `UPDATE plaid_items SET sync_cursor = NULL WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId]
  )
}

export async function upsertTransactions(userId, itemId, txns) {
  if (!txns.length) return
  for (const t of txns) {
    await query(
      `INSERT INTO transactions (user_id, item_id, account_id, plaid_transaction_id, name, amount, date, authorized_date, account_name, payment_channel, personal_finance_category, pending, logo_url, original_description, merchant_name, location, website, personal_finance_category_detailed, personal_finance_category_confidence, counterparties, payment_meta, check_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       ON CONFLICT (plaid_transaction_id) DO UPDATE SET
         name = EXCLUDED.name, amount = EXCLUDED.amount, date = EXCLUDED.date, authorized_date = EXCLUDED.authorized_date,
         account_name = EXCLUDED.account_name, payment_channel = EXCLUDED.payment_channel,
         personal_finance_category = EXCLUDED.personal_finance_category, pending = EXCLUDED.pending, logo_url = EXCLUDED.logo_url,
         original_description = EXCLUDED.original_description, merchant_name = EXCLUDED.merchant_name, location = EXCLUDED.location,
         website = EXCLUDED.website, personal_finance_category_detailed = EXCLUDED.personal_finance_category_detailed,
         personal_finance_category_confidence = EXCLUDED.personal_finance_category_confidence,
         counterparties = EXCLUDED.counterparties, payment_meta = EXCLUDED.payment_meta, check_number = EXCLUDED.check_number`,
      [userId, itemId, t.account_id, t.transaction_id,
       encrypt(t.name), encryptNum(t.amount), t.date, t.authorized_date ?? null,
       encrypt(t.account_name ?? null), encrypt(t.payment_channel ?? null),
       encrypt(t.personal_finance_category ?? null), encryptBool(t.pending === true),
       encrypt(t.logo_url ?? null), encrypt(t.original_description ?? null),
       encrypt(t.merchant_name ?? null), encryptJSON(t.location ?? null),
       encrypt(t.website ?? null), encrypt(t.personal_finance_category_detailed ?? null),
       encrypt(t.personal_finance_category_confidence ?? null),
       encryptJSON(t.counterparties?.length ? t.counterparties : null),
       encryptJSON(t.payment_meta ?? null), encrypt(t.check_number ?? null)]
    )
  }
}

export async function updateTransactionAccountNames(userId, accountId, accountName) {
  // Can't compare encrypted ciphertext (random IV), so always update
  await query(
    `UPDATE transactions SET account_name = $3 WHERE user_id = $1 AND account_id = $2`,
    [userId, accountId, encrypt(accountName)]
  )
}

export async function updateTransactionCategory(userId, plaidTransactionId, category, detailedCategory) {
  await query(
    `UPDATE transactions SET personal_finance_category = $3, personal_finance_category_detailed = $4
     WHERE user_id = $1 AND plaid_transaction_id = $2`,
    [userId, plaidTransactionId, encrypt(category), encrypt(detailedCategory)]
  )
}

export async function updateTransactionRecurring(userId, plaidTransactionId, recurring) {
  await query(
    `UPDATE transactions SET recurring = $3
     WHERE user_id = $1 AND plaid_transaction_id = $2`,
    [userId, plaidTransactionId, encrypt(recurring)]
  )
}

/**
 * Returns subscription transactions that have a recurring frequency set.
 * Used to augment the upcoming payments list with user-marked subscriptions.
 */
export async function getSubscriptionPayments(userId) {
  // personal_finance_category is encrypted — fetch all with recurring IS NOT NULL, then filter in JS
  const { rows } = await query(
    `SELECT plaid_transaction_id, name, merchant_name, amount, date, recurring,
       personal_finance_category, personal_finance_category_detailed,
       logo_url, account_name
     FROM transactions
     WHERE user_id = $1
       AND recurring IS NOT NULL
     ORDER BY date DESC`,
    [userId]
  )
  const decrypted = decryptRows(rows, TX_FIELDS)
  // Filter to SUBSCRIPTION category, then dedupe by merchant+amount+recurring
  const subscriptions = decrypted.filter(r => r.personal_finance_category === 'SUBSCRIPTION')
  const seen = new Set()
  return subscriptions.filter(r => {
    const key = `${r.merchant_name}|${r.amount}|${r.recurring}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function deleteTransactionsByPlaidIds(plaidTransactionIds) {
  if (!plaidTransactionIds.length) return
  await query(
    `DELETE FROM transactions WHERE plaid_transaction_id = ANY($1)`,
    [plaidTransactionIds]
  )
}

/** Return map of plaid_transaction_id -> logo_url for given ids (for recurring stream logos). */
export async function getLogoUrlsByPlaidTransactionIds(userId, plaidTransactionIds) {
  if (!plaidTransactionIds.length) return {}
  const { rows } = await query(
    `SELECT plaid_transaction_id, logo_url FROM transactions WHERE user_id = $1 AND plaid_transaction_id = ANY($2) AND logo_url IS NOT NULL`,
    [userId, plaidTransactionIds]
  )
  const map = {}
  for (const r of rows) map[r.plaid_transaction_id] = decrypt(r.logo_url)
  return map
}

const reportedDateExpr = 'COALESCE(authorized_date, date)'
const TX_SELECT = `SELECT id, plaid_transaction_id, name, amount, date::text, authorized_date::text, account_name, account_id, item_id, pending, logo_url, payment_channel, personal_finance_category, original_description, merchant_name, location, website, personal_finance_category_detailed, personal_finance_category_confidence, counterparties, payment_meta, check_number, recurring FROM transactions`

export async function getRecentTransactions(userId, limit = 25, { beforeDate, afterDate, fromDate, toDate, accountIds, categories, detailedCategories, search, sort = 'recent', offset = 0 } = {}) {
  // Only filter on plaintext columns (user_id, dates, account_id) in SQL.
  // Encrypted fields (categories, amounts, names) are filtered in JS after decryption.
  const conditions = ['user_id = $1']
  const params = [userId]
  let p = 2

  if (fromDate && toDate) {
    conditions.push(`${reportedDateExpr} >= $${p++} AND ${reportedDateExpr} <= $${p++}`)
    params.push(fromDate, toDate)
  } else if (afterDate) {
    conditions.push(`${reportedDateExpr} >= $${p++}`)
    params.push(afterDate)
  } else if (beforeDate) {
    conditions.push(`${reportedDateExpr} <= $${p++}`)
    params.push(beforeDate)
  }

  if (accountIds?.length) {
    conditions.push(`account_id = ANY($${p++})`)
    params.push(accountIds)
  }

  const where = conditions.join(' AND ')
  const { rows } = await query(
    `${TX_SELECT} WHERE ${where} ORDER BY ${reportedDateExpr} DESC, created_at DESC`,
    params
  )

  let filtered = decryptRows(rows, TX_FIELDS)

  // Filter on encrypted fields in JS
  if (categories?.length) {
    filtered = filtered.filter(r => r.personal_finance_category && categories.includes(r.personal_finance_category))
  }
  if (detailedCategories?.length) {
    filtered = filtered.filter(r => r.personal_finance_category_detailed && detailedCategories.includes(r.personal_finance_category_detailed))
  }
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter(r =>
      (r.merchant_name && r.merchant_name.toLowerCase().includes(s)) ||
      (r.name && r.name.toLowerCase().includes(s))
    )
  }

  // Sort in JS (dates already sorted by SQL for 'recent')
  if (sort === 'oldest') {
    filtered.sort((a, b) => (a.authorized_date || a.date || '').localeCompare(b.authorized_date || b.date || ''))
  } else if (sort === 'amount_desc') {
    filtered.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  } else if (sort === 'amount_asc') {
    filtered.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))
  }

  const total = filtered.length
  const transactions = filtered.slice(offset, offset + limit)
  return { transactions, total }
}

export async function getTransactionAccounts(userId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (account_id) account_id, account_name
     FROM transactions
     WHERE user_id = $1 AND account_name IS NOT NULL
     ORDER BY account_id`,
    [userId]
  )
  return decryptRows(rows, { account_name: 'string' })
}

export async function getTransactionCategories(userId) {
  // Categories are encrypted — fetch all, decrypt, dedupe in JS
  const { rows } = await query(
    `SELECT personal_finance_category
     FROM transactions
     WHERE user_id = $1 AND personal_finance_category IS NOT NULL`,
    [userId]
  )
  const decrypted = decryptRows(rows, { personal_finance_category: 'string' })
  return [...new Set(decrypted.map(r => r.personal_finance_category).filter(Boolean))].sort()
}

export async function getTransactionsForNetWorth(userId, sinceDate) {
  const { rows } = await query(
    `SELECT account_id, amount, date::text AS date
     FROM transactions
     WHERE user_id = $1 AND date >= $2
     ORDER BY account_id, date ASC`,
    [userId, sinceDate]
  )
  return decryptRows(rows, { amount: 'number' })
}

export async function getEarliestTransactionDate(userId) {
  const { rows } = await query(
    `SELECT MIN(date)::text AS earliest FROM transactions WHERE user_id = $1`,
    [userId]
  )
  return rows[0]?.earliest ?? null
}

/**
 * Categories excluded from "spending". Kept intentionally narrow — only true non-expenses.
 * TRANSFER_IN/OUT is the primary double-counting guard (e.g. suppresses the checking-side
 * credit card payment while individual CC charges show through on the card feed).
 * Rent, utilities, and loan payments are real cash outflows and ARE counted as spending.
 */
const NON_SPENDING_CATEGORIES = [
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'BANK_FEES',
]

// Surgical detailed-category exclusions: these fall under primary categories we
// otherwise DO count (e.g. LOAN_PAYMENTS), but represent inter-account settlements
// where the underlying transactions are already captured on the linked card/account.
const NON_SPENDING_DETAILED_CATEGORIES = [
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT',
  // Credit card "Payment Thank You" recorded on the card account — the other side of LOAN_PAYMENTS_CREDIT_CARD_PAYMENT
  'LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT',
]

export async function getSpendingSummaryByAccount(userId, period, accountIds, excludeCategories = []) {
  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  const mergedPrimary = excludeCategories.length > 0
    ? [...NON_SPENDING_CATEGORIES, ...excludeCategories]
    : NON_SPENDING_CATEGORIES

  let startDate, bucketFn
  if (period === 'week') {
    const start = new Date(); start.setDate(start.getDate() - 6)
    startDate = toDateStrET(start)
    bucketFn = (d) => d // daily bucket = date string
  } else if (period === 'month') {
    const start = new Date(); start.setDate(start.getDate() - 28)
    startDate = toDateStrET(start)
    // weekly bucket: truncate to Monday
    bucketFn = (d) => {
      const dt = new Date(d + 'T00:00:00'); const day = dt.getDay()
      dt.setDate(dt.getDate() - ((day + 6) % 7)) // Monday
      return toDateStrET(dt)
    }
  } else {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    startDate = toDateStrET(startOfMonth).slice(0, 8) + '01'
    bucketFn = (d) => d.slice(0, 7) // YYYY-MM
  }

  // Fetch all transactions in the date range (only plaintext filters in SQL)
  const params = [userId, startDate]
  let filterClause = ''
  if (hasFilter) {
    params.push(accountIds)
    filterClause = `AND account_id = ANY($${params.length})`
  }
  const { rows } = await query(
    `SELECT amount, account_name, personal_finance_category, personal_finance_category_detailed,
            COALESCE(authorized_date, date)::text AS tx_date
     FROM transactions
     WHERE user_id = $1 AND COALESCE(authorized_date, date) >= $2::date ${filterClause}`,
    params
  )

  // Decrypt and aggregate in JS
  const decrypted = decryptRows(rows, { amount: 'number', account_name: 'string', personal_finance_category: 'string', personal_finance_category_detailed: 'string' })
  const totals = new Map() // "bucket\0account_name" → total
  for (const r of decrypted) {
    if (r.amount == null || r.amount <= 0) continue
    if (mergedPrimary.includes(r.personal_finance_category)) continue
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) continue
    const bucket = bucketFn(r.tx_date)
    const acct = r.account_name || 'Unknown'
    const key = `${bucket}\0${acct}`
    totals.set(key, (totals.get(key) || 0) + r.amount)
  }

  const result = []
  for (const [key, total] of totals) {
    const [bucket, account_name] = key.split('\0')
    result.push({ bucket, account_name, total })
  }
  result.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.account_name.localeCompare(b.account_name))
  return result
}

/** Monthly spending totals for a single account. Same exclusions as other spending queries. */
export async function getMonthlySpendingByAccount(userId, accountId, monthsBack = 12) {
  const n = Math.min(Math.max(monthsBack, 1), 36)
  const now = new Date()
  const startMonth = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1)
  const startDate = toDateStrET(startMonth).slice(0, 8) + '01'

  const { rows } = await query(
    `SELECT amount, personal_finance_category, personal_finance_category_detailed,
            COALESCE(authorized_date, date)::text AS tx_date
     FROM transactions
     WHERE user_id = $1 AND account_id = $2 AND COALESCE(authorized_date, date) >= $3::date`,
    [userId, accountId, startDate]
  )

  const decrypted = decryptRows(rows, { amount: 'number', personal_finance_category: 'string', personal_finance_category_detailed: 'string' })
  const totals = new Map()
  for (const r of decrypted) {
    if (r.amount == null || r.amount <= 0) continue
    if (NON_SPENDING_CATEGORIES.includes(r.personal_finance_category)) continue
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) continue
    const month = r.tx_date.slice(0, 7)
    totals.set(month, (totals.get(month) || 0) + r.amount)
  }

  return [...totals.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

// Inter-account transfers excluded from cash flow to avoid double-counting
// (e.g. savings → checking shows as both inflow and outflow).
const CASH_FLOW_EXCLUDED_CATEGORIES = ['TRANSFER_IN', 'TRANSFER_OUT']

/** Monthly cash flow: inflows (credits), outflows (debits), net. Plaid: positive = out, negative = in. */
export async function getMonthlyCashFlow(userId, months = 24, accountIds = null) {
  const n = Math.min(Math.max(months, 1), 36)
  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  const params = [userId]
  let filterClause = ''
  if (hasFilter) {
    params.push(accountIds)
    filterClause = `AND account_id = ANY($${params.length})`
  }
  const { rows } = await query(
    `SELECT amount, personal_finance_category, personal_finance_category_detailed,
            COALESCE(authorized_date, date)::text AS tx_date
     FROM transactions
     WHERE user_id = $1 ${filterClause}`,
    params
  )

  const decrypted = decryptRows(rows, { amount: 'number', personal_finance_category: 'string', personal_finance_category_detailed: 'string' })
  const monthMap = new Map() // month → { inflows, outflows }
  for (const r of decrypted) {
    if (r.amount == null) continue
    if (CASH_FLOW_EXCLUDED_CATEGORIES.includes(r.personal_finance_category)) continue
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) continue
    const month = r.tx_date.slice(0, 7)
    const entry = monthMap.get(month) || { inflows: 0, outflows: 0 }
    if (r.amount < 0) entry.inflows += Math.abs(r.amount)
    else entry.outflows += r.amount
    monthMap.set(month, entry)
  }

  return [...monthMap.entries()]
    .map(([month, { inflows, outflows }]) => ({ month, inflows, outflows, net: inflows - outflows }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, n)
}

/**
 * Cash flow time series with configurable granularity and date range.
 * granularity: 'day' | 'week' | 'month'
 */
export async function getCashFlowTimeSeries(userId, startDate, endDate, granularity = 'month', accountIds = null) {
  let bucketFn
  if (granularity === 'day') {
    bucketFn = (d) => d // YYYY-MM-DD
  } else if (granularity === 'week') {
    bucketFn = (d) => {
      const dt = new Date(d + 'T00:00:00'); const day = dt.getDay()
      dt.setDate(dt.getDate() - ((day + 6) % 7))
      return toDateStrET(dt)
    }
  } else {
    bucketFn = (d) => d.slice(0, 7) // YYYY-MM
  }

  const params = [userId, startDate, endDate]
  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  let filterClause = ''
  if (hasFilter) {
    params.push(accountIds)
    filterClause = `AND account_id = ANY($${params.length})`
  }

  const { rows } = await query(
    `SELECT amount, personal_finance_category, personal_finance_category_detailed,
            COALESCE(authorized_date, date)::text AS tx_date
     FROM transactions
     WHERE user_id = $1
       AND COALESCE(authorized_date, date) >= $2::date
       AND COALESCE(authorized_date, date) <= $3::date
       ${filterClause}`,
    params
  )

  const decrypted = decryptRows(rows, { amount: 'number', personal_finance_category: 'string', personal_finance_category_detailed: 'string' })
  const bucketMap = new Map()
  for (const r of decrypted) {
    if (r.amount == null) continue
    if (CASH_FLOW_EXCLUDED_CATEGORIES.includes(r.personal_finance_category)) continue
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) continue
    const bucket = bucketFn(r.tx_date)
    const entry = bucketMap.get(bucket) || { inflows: 0, outflows: 0 }
    if (r.amount < 0) entry.inflows += Math.abs(r.amount)
    else entry.outflows += r.amount
    bucketMap.set(bucket, entry)
  }

  return [...bucketMap.entries()]
    .map(([bucket, { inflows, outflows }]) => ({ bucket, inflows, outflows, net: inflows - outflows }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

/** Transactions for a given month (YYYY-MM) or date range, split into inflows and outflows. Same exclusions as getMonthlyCashFlow. */
export async function getCashFlowTransactions(userId, month, startDate = null, endDate = null) {
  let dateClause, params
  if (startDate && endDate) {
    dateClause = `AND COALESCE(authorized_date, date) >= $2::date AND COALESCE(authorized_date, date) <= $3::date`
    params = [userId, startDate, endDate]
  } else {
    dateClause = `AND to_char(date_trunc('month', COALESCE(authorized_date, date)), 'YYYY-MM') = $2`
    params = [userId, month]
  }
  const { rows } = await query(
    `${TX_SELECT}
     WHERE user_id = $1
       ${dateClause}
     ORDER BY COALESCE(authorized_date, date) DESC, created_at DESC`,
    params
  )
  const decrypted = decryptRows(rows, TX_FIELDS)
  const filtered = decrypted.filter(r => {
    if (CASH_FLOW_EXCLUDED_CATEGORIES.includes(r.personal_finance_category)) return false
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) return false
    return true
  })
  const inflows = filtered.filter(r => r.amount < 0)
  const outflows = filtered.filter(r => r.amount > 0)
  return { inflows, outflows }
}

// ── Cash flow breakdown (Sankey page) ─────────────────────────────────────

/** Plaid primary categories → user-friendly group names for Sankey "group" breakdown. */
const CATEGORY_GROUP_MAP = {
  INCOME: 'Earned Income',
  FOOD_AND_DRINK: 'Food & Dining',
  RENT_AND_UTILITIES: 'Bills & Utilities',
  TRANSPORTATION: 'Transportation',
  LOAN_PAYMENTS: 'Financial',
  ENTERTAINMENT: 'Entertainment',
  GENERAL_MERCHANDISE: 'Shopping',
  PERSONAL_CARE: 'Personal Care',
  MEDICAL: 'Healthcare',
  TRAVEL: 'Travel',
  HOME_IMPROVEMENT: 'Housing',
  GOVERNMENT_AND_NON_PROFIT: 'Taxes & Fees',
  BANK_FEES: 'Fees',
}

/** Compute trailing date window for cash flow periods. */
function cashFlowDateRange(period) {
  const now = new Date()
  let startDate
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    startDate = toDateStrET(d)
  } else if (period === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 29)
    startDate = toDateStrET(d)
  } else if (period === 'quarter') {
    const d = new Date(now); d.setMonth(d.getMonth() - 2); d.setDate(1)
    startDate = toDateStrET(d)
  } else if (period === 'ytd') {
    startDate = `${toDateStrET(now).slice(0, 4)}-01-01`
  } else {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
    startDate = toDateStrET(d)
  }
  const endDate = toDateStrET(now)
  return { startDate, endDate }
}

/**
 * Cash flow breakdown by category/group/merchant for a given period.
 * Used by the Sankey diagram on the Cash Flow page.
 * Returns rows: { flow_type: 'income'|'expense', category_key, total_amount }
 */
export async function getCashFlowBreakdown(userId, period, breakdown = 'category', accountIds = null, customRange = null, excludeCategories = []) {
  const { startDate, endDate } = customRange || cashFlowDateRange(period)

  const mergedExcluded = excludeCategories.length > 0
    ? [...CASH_FLOW_EXCLUDED_CATEGORIES, ...excludeCategories]
    : CASH_FLOW_EXCLUDED_CATEGORIES

  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  const params = [userId, startDate, endDate]
  let filterClause = ''
  if (hasFilter) {
    params.push(accountIds)
    filterClause = `AND account_id = ANY($${params.length})`
  }

  // Fetch transactions in date range
  const { rows } = await query(
    `SELECT amount, name, merchant_name, personal_finance_category, personal_finance_category_detailed, item_id,
            COALESCE(authorized_date, date)::text AS tx_date
     FROM transactions
     WHERE user_id = $1
       AND COALESCE(authorized_date, date) >= $2::date
       AND COALESCE(authorized_date, date) <= $3::date
       ${filterClause}`,
    params
  )
  const txDecrypted = decryptRows(rows, { amount: 'number', name: 'string', merchant_name: 'string', personal_finance_category: 'string', personal_finance_category_detailed: 'string' })

  // Build Venmo item_id set (fetch plaid_items for this user, decrypt institution_name, check for Venmo)
  const { rows: items } = await query(`SELECT item_id, institution_name FROM plaid_items WHERE user_id = $1`, [userId])
  const itemsDecrypted = decryptRows(items, { institution_name: 'string' })
  const venmoItemIds = new Set(itemsDecrypted.filter(i => (i.institution_name || '').toLowerCase().includes('venmo')).map(i => i.item_id))

  // Choose grouping function
  let groupFn
  if (breakdown === 'merchant') {
    groupFn = (r) => r.merchant_name || r.name || 'Unknown'
  } else if (breakdown === 'group') {
    groupFn = (r) => CATEGORY_GROUP_MAP[r.personal_finance_category] || r.personal_finance_category || 'Other'
  } else {
    groupFn = (r) => r.personal_finance_category || 'OTHER'
  }

  // Aggregate in JS
  const totals = new Map() // "flow_type\0category_key" → total_amount
  for (const r of txDecrypted) {
    if (r.amount == null) continue
    if (mergedExcluded.includes(r.personal_finance_category)) continue
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) continue
    const flowType = r.amount < 0 ? 'income' : 'expense'
    // Venmo override: inflows from Venmo accounts → 'Venmo'
    const categoryKey = (r.amount < 0 && venmoItemIds.has(r.item_id)) ? 'Venmo' : groupFn(r)
    const key = `${flowType}\0${categoryKey}`
    totals.set(key, (totals.get(key) || 0) + Math.abs(r.amount))
  }

  return [...totals.entries()]
    .map(([key, total_amount]) => {
      const [flow_type, category_key] = key.split('\0')
      return { flow_type, category_key, total_amount }
    })
    .sort((a, b) => b.total_amount - a.total_amount)
}

/**
 * Drill-down: return individual transactions for a Sankey node.
 * Filters by period, flow direction (income/expense), category key, and breakdown type.
 */
export async function getCashFlowNodeTransactions(userId, period, breakdown, flowType, categoryKey, accountIds = null, customRange = null) {
  const { startDate, endDate } = customRange || cashFlowDateRange(period)

  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  const params = [userId, startDate, endDate]
  let filterClause = ''
  if (hasFilter) {
    params.push(accountIds)
    filterClause = `AND account_id = ANY($${params.length})`
  }

  // Fetch all transactions in date range
  const { rows } = await query(
    `${TX_SELECT}
     WHERE user_id = $1
       AND COALESCE(authorized_date, date) >= $2::date
       AND COALESCE(authorized_date, date) <= $3::date
       ${filterClause}
     ORDER BY COALESCE(authorized_date, date) DESC, created_at DESC`,
    params
  )
  const txDecrypted = decryptRows(rows, TX_FIELDS)

  // Build Venmo item_id set
  const { rows: items } = await query(`SELECT item_id, institution_name FROM plaid_items WHERE user_id = $1`, [userId])
  const itemsDecrypted = decryptRows(items, { institution_name: 'string' })
  const venmoItemIds = new Set(itemsDecrypted.filter(i => (i.institution_name || '').toLowerCase().includes('venmo')).map(i => i.item_id))

  // Build same grouping function as getCashFlowBreakdown
  let groupFn
  if (breakdown === 'merchant') {
    groupFn = (r) => r.merchant_name || r.name || 'Unknown'
  } else if (breakdown === 'group') {
    groupFn = (r) => CATEGORY_GROUP_MAP[r.personal_finance_category] || r.personal_finance_category || 'Other'
  } else {
    groupFn = (r) => r.personal_finance_category || 'OTHER'
  }

  // Support multiple category keys (comma-separated) for "Everything else" bucket
  const categoryKeys = new Set(categoryKey.includes(',') ? categoryKey.split(',') : [categoryKey])

  return txDecrypted.filter(r => {
    if (r.amount == null) return false
    if (CASH_FLOW_EXCLUDED_CATEGORIES.includes(r.personal_finance_category)) return false
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) return false
    // Flow direction
    if (flowType === 'income' && r.amount >= 0) return false
    if (flowType === 'expense' && r.amount <= 0) return false
    // Category match (with Venmo override)
    const resolved = (r.amount < 0 && venmoItemIds.has(r.item_id)) ? 'Venmo' : groupFn(r)
    return categoryKeys.has(resolved)
  })
}

// ── Investment snapshot writes ─────────────────────────────────────────────

/** Upsert today's total portfolio value. Live writes overwrite; backfill never overwrites live. */
export async function upsertPortfolioSnapshot(userId, date, totalValue, source, unavailableItems = null) {
  await query(
    `INSERT INTO portfolio_snapshots (user_id, date, total_value, source, unavailable_items, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, date) DO UPDATE
       SET total_value = EXCLUDED.total_value,
           source = EXCLUDED.source,
           unavailable_items = EXCLUDED.unavailable_items,
           updated_at = NOW()`,
    [userId, date, encryptNum(totalValue), encrypt(source), encryptJSON(unavailableItems)]
  )
}

/** Upsert today's per-account value for one investment account. */
export async function upsertPortfolioAccountSnapshot(userId, date, itemId, accountId, accountName, institution, value, source) {
  await query(
    `INSERT INTO portfolio_account_snapshots (user_id, date, item_id, account_id, account_name, institution, value, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, date, account_id) DO UPDATE
       SET value = EXCLUDED.value,
           account_name = EXCLUDED.account_name,
           institution = EXCLUDED.institution,
           source = EXCLUDED.source`,
    [userId, date, itemId, accountId, encrypt(accountName), encrypt(institution), encryptNum(value), encrypt(source)]
  )
}

/** Upsert today's per-security holding for one account. */
export async function upsertHoldingSnapshot(userId, date, itemId, accountId, accountName, institution, securityId, ticker, securityName, securityType, quantity, price, value, costBasis, currency, source, lotIndex = 0) {
  await query(
    `INSERT INTO holdings_snapshots
       (user_id, date, item_id, account_id, account_name, institution, security_id, ticker, security_name, security_type, quantity, price, value, cost_basis, currency, source, lot_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (user_id, date, account_id, security_id, lot_index) DO UPDATE
       SET quantity = EXCLUDED.quantity,
           price = EXCLUDED.price,
           value = EXCLUDED.value,
           cost_basis = EXCLUDED.cost_basis,
           source = EXCLUDED.source`,
    [userId, date, itemId, accountId, encrypt(accountName), encrypt(institution), securityId,
     encrypt(ticker), encrypt(securityName), encrypt(securityType),
     encryptNum(quantity), encryptNum(price), encryptNum(value), encryptNum(costBasis),
     encrypt(currency), encrypt(source), lotIndex]
  )
}

/** Upsert security metadata. Called whenever a new security is seen. */
export async function upsertSecurity(securityId, ticker, name, type, currency) {
  await query(
    `INSERT INTO securities (security_id, ticker, name, type, currency, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (security_id) DO UPDATE
       SET ticker = EXCLUDED.ticker,
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           currency = EXCLUDED.currency,
           updated_at = NOW()`,
    [securityId, encrypt(ticker), encrypt(name), encrypt(type), encrypt(currency ?? 'USD')]
  )
}

/** Fetch investment transactions for a specific account, ordered newest first. */
export async function getInvestmentTransactionsByAccount(userId, accountId, limit = 200) {
  const { rows } = await query(
    `SELECT date::text AS date, type, subtype, ticker, security_name, security_type, quantity, price, amount, fees, currency
     FROM investment_transactions
     WHERE user_id = $1 AND account_id = $2
     ORDER BY date DESC
     LIMIT $3`,
    [userId, accountId, limit]
  )
  return decryptRows(rows, INV_TX_FIELDS)
}

/** Fetch investment transactions for a specific ticker across all accounts, ordered newest first. */
export async function getInvestmentTransactionsByTicker(userId, ticker, limit = 200) {
  // Ticker is encrypted — fetch all for user, decrypt, filter by ticker in JS
  const { rows } = await query(
    `SELECT date::text AS date, type, subtype, ticker, security_name, security_type, quantity, price, amount, fees, currency, account_name, institution
     FROM investment_transactions
     WHERE user_id = $1
     ORDER BY date DESC`,
    [userId]
  )
  const decrypted = decryptRows(rows, INV_TX_FIELDS)
  return decrypted.filter(r => r.ticker === ticker).slice(0, limit)
}

/** Insert investment transactions; skip duplicates (idempotent). */
export async function upsertInvestmentTransactions(txns) {
  for (const t of txns) {
    await query(
      `INSERT INTO investment_transactions
         (user_id, item_id, account_id, institution, account_name, plaid_investment_txn_id, date, type, subtype, security_id, ticker, security_name, security_type, quantity, price, amount, fees, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (plaid_investment_txn_id) DO NOTHING`,
      [t.user_id, t.item_id, t.account_id, encrypt(t.institution), encrypt(t.account_name),
       t.plaid_investment_txn_id, t.date, encrypt(t.type), encrypt(t.subtype), t.security_id,
       encrypt(t.ticker), encrypt(t.security_name), encrypt(t.security_type),
       encryptNum(t.quantity), encryptNum(t.price), encryptNum(t.amount), encryptNum(t.fees),
       encrypt(t.currency ?? 'USD')]
    )
  }
}

// ── CLI tokens ────────────────────────────────────────────────────────────

export async function createCliToken(userId, tokenHash, name, expiresAt) {
  await query(
    `INSERT INTO cli_tokens (user_id, token_hash, name, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, encrypt(name ?? null), expiresAt]
  )
}

export async function getCliTokenByHash(tokenHash) {
  const { rows } = await query(
    `SELECT id, user_id, expires_at FROM cli_tokens WHERE token_hash = $1`,
    [tokenHash]
  )
  return rows[0] ?? null
}

export async function touchCliToken(id) {
  await query(`UPDATE cli_tokens SET last_used_at = NOW() WHERE id = $1`, [id])
}

export async function revokeAllCliTokens(userId) {
  await query(`DELETE FROM cli_tokens WHERE user_id = $1`, [userId])
}

// ── Investment snapshot reads ──────────────────────────────────────────────

/** Distinct investment accounts from holdings snapshots — used by the portfolio agent to resolve institution/account references.
 *  Joins to plaid_items to exclude orphaned snapshots from deleted items. */
export async function getInvestmentAccounts(userId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (hs.account_id) hs.account_id, hs.account_name, hs.institution
     FROM holdings_snapshots hs
     INNER JOIN plaid_items pi ON pi.item_id = hs.item_id AND pi.user_id = hs.user_id
     WHERE hs.user_id = $1 AND hs.account_name IS NOT NULL
     ORDER BY hs.account_id`,
    [userId]
  )
  return decryptRows(rows, { account_name: 'string', institution: 'string' })
}

/** Read portfolio_snapshots for the chart. Returns only dates that exist — no fill. */
export async function getPortfolioHistory(userId, sinceDate) {
  const { rows } = await query(
    `SELECT date::text AS date, total_value AS value, source, unavailable_items
     FROM portfolio_snapshots
     WHERE user_id = $1 AND date >= $2
     ORDER BY date ASC`,
    [userId, sinceDate]
  )
  return rows.map((r) => {
    const value = decryptNum(r.value)
    const source = decrypt(r.source)
    const unavailableItems = decryptJSON(r.unavailable_items)
    return {
      date: r.date,
      value: value ?? 0,
      source,
      ...(unavailableItems ? { unavailableItems } : {}),
    }
  })
}

/** Read portfolio_account_snapshots filtered by account IDs. Sums per day. */
export async function getPortfolioAccountHistory(userId, sinceDate, accountIds) {
  // Value is encrypted — fetch rows, decrypt, sum by date in JS
  const { rows } = await query(
    `SELECT date::text AS date, value, account_id
     FROM portfolio_account_snapshots
     WHERE user_id = $1 AND date >= $2 AND account_id = ANY($3)
     ORDER BY date ASC`,
    [userId, sinceDate, accountIds]
  )
  const decrypted = decryptRows(rows, { value: 'number' })
  const byDate = new Map()
  for (const r of decrypted) {
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + (r.value ?? 0))
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value }))
}

/** Daily price history per ticker — used by the Portfolio Movers chart. */
export async function getHoldingsHistory(userId, sinceDate) {
  // Ticker, price, etc. are encrypted — fetch all, decrypt, group in JS
  const { rows } = await query(
    `SELECT date, ticker, account_id, account_name, security_name, security_type, price
     FROM holdings_snapshots
     WHERE user_id = $1 AND date >= $2
     ORDER BY date`,
    [userId, sinceDate]
  )
  const decrypted = decryptRows(rows, HOLDING_FIELDS)
  // Filter and group by date+ticker+account_id (replicating the old GROUP BY)
  const grouped = new Map()
  for (const r of decrypted) {
    if (r.price == null || r.price <= 0 || !r.ticker) continue
    const key = `${r.date}|${r.ticker}|${r.account_id}`
    if (!grouped.has(key)) {
      grouped.set(key, { date: r.date, ticker: r.ticker, account_id: r.account_id, account_name: r.account_name, security_name: r.security_name, security_type: r.security_type, price: r.price })
    } else {
      const existing = grouped.get(key)
      if (r.price > existing.price) existing.price = r.price
    }
  }
  const result = [...grouped.values()]
  result.sort((a, b) => (a.ticker + a.account_id + a.date).localeCompare(b.ticker + b.account_id + b.date))
  return result
}

/** Holdings snapshot for a specific date — used by the chart click side panel. */
export async function getHoldingsSnapshotForDate(userId, date) {
  const { rows } = await query(
    `SELECT account_id, account_name, institution, ticker, security_name, security_type,
            quantity, price, value, cost_basis, currency
     FROM holdings_snapshots
     WHERE user_id = $1 AND date = $2`,
    [userId, date]
  )
  const decrypted = decryptRows(rows, HOLDING_FIELDS)
  decrypted.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return decrypted
}

/** Latest portfolio snapshot value for a user (used as current value). */
export async function getLatestPortfolioValue(userId) {
  const { rows } = await query(
    `SELECT total_value FROM portfolio_snapshots
     WHERE user_id = $1
     ORDER BY date DESC LIMIT 1`,
    [userId]
  )
  return rows[0] ? decryptNum(rows[0].total_value) : null
}

/** Returns true if the user has any portfolio snapshots before today (backfill already done or live data accumulated).
 *  today must be passed as a 'YYYY-MM-DD' string from Node.js to avoid DB timezone mismatches. */
export async function hasHistoricalPortfolioData(userId, today) {
  const { rows } = await query(
    `SELECT 1 FROM portfolio_snapshots
     WHERE user_id = $1 AND date < $2
     LIMIT 1`,
    [userId, today]
  )
  return rows.length > 0
}

/** Returns true if a live portfolio snapshot already exists for today. Used to skip redundant Plaid calls.
 *  today must be passed as a 'YYYY-MM-DD' string from Node.js to avoid DB timezone mismatches. */
export async function hasTodaySnapshot(userId, today) {
  // source is encrypted — fetch candidates by user+date+time, check source in JS
  const { rows } = await query(
    `SELECT source, unavailable_items FROM portfolio_snapshots
     WHERE user_id = $1 AND date = $2
       AND updated_at > NOW() - INTERVAL '30 minutes'
     LIMIT 1`,
    [userId, today]
  )
  if (!rows.length) return false
  const source = decrypt(rows[0].source)
  const unavailable = rows[0].unavailable_items
  return source === 'live' && unavailable == null
}

/** Get the most recent holdings snapshot for each security (starting point for quantity reconstruction). */
export async function getLatestHoldingsSnapshot(userId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (account_id, security_id)
       account_id, security_id, ticker, security_name, security_type, quantity, price, value, institution, item_id, currency
     FROM holdings_snapshots
     WHERE user_id = $1
     ORDER BY account_id, security_id, date DESC`,
    [userId]
  )
  return decryptRows(rows, HOLDING_FIELDS)
}

/** Upsert a daily balance snapshot for one account. Called after every live accountsBalanceGet. */
export async function upsertAccountBalanceSnapshot(userId, itemId, institutionName, account, date) {
  await query(
    `INSERT INTO account_balance_snapshots
       (user_id, item_id, account_id, account_name, institution_name, date, current, available, credit_limit, type, subtype, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (user_id, account_id, date) DO UPDATE SET
       current       = EXCLUDED.current,
       available     = EXCLUDED.available,
       credit_limit  = EXCLUDED.credit_limit,
       account_name  = EXCLUDED.account_name,
       institution_name = EXCLUDED.institution_name`,
    [
      userId, itemId, account.account_id,
      encrypt(account.name), encrypt(institutionName ?? null), date,
      encryptNum(account.current ?? null), encryptNum(account.available ?? null), encryptNum(account.limit ?? null),
      encrypt(account.type ?? null), encrypt(account.subtype ?? null), encrypt(account.currency ?? 'USD'),
    ]
  )
}

/** Get balance history for all accounts belonging to a user, ordered by date ascending. */
export async function getAccountBalanceHistory(userId, { afterDate, beforeDate, accountId } = {}) {
  const conditions = ['abs.user_id = $1']
  const params = [userId]
  if (afterDate) { params.push(afterDate); conditions.push(`abs.date >= $${params.length}`) }
  if (beforeDate) { params.push(beforeDate); conditions.push(`abs.date <= $${params.length}`) }
  if (accountId) { params.push(accountId); conditions.push(`abs.account_id = $${params.length}`) }
  const { rows } = await query(
    `SELECT abs.date, abs.account_id, abs.account_name, abs.institution_name, abs.type, abs.subtype,
            abs.current, abs.available, abs.credit_limit, abs.currency
     FROM account_balance_snapshots abs
     INNER JOIN plaid_items pi ON pi.item_id = abs.item_id AND pi.user_id = abs.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY abs.date ASC`,
    params
  )
  return decryptRows(rows, BALANCE_FIELDS)
}

/** Returns the most recent balance snapshot per account for a user (depository/credit/loan). */
export async function getLatestAccountBalances(userId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (account_id)
       account_id, account_name, institution_name, type, subtype,
       current, available, credit_limit, currency, date AS as_of_date
     FROM account_balance_snapshots
     WHERE user_id = $1
     ORDER BY account_id, date DESC`,
    [userId]
  )
  return decryptRows(rows, BALANCE_FIELDS)
}

/** Returns per-date, per-account investment values from portfolio_account_snapshots. */
export async function getInvestmentBalanceHistory(userId, { afterDate } = {}) {
  const conditions = ['pas.user_id = $1']
  const params = [userId]
  if (afterDate) {
    conditions.push(`pas.date >= $${params.length + 1}`)
    params.push(afterDate)
  }
  const { rows } = await query(
    `SELECT pas.date::text AS date, pas.account_id, pas.account_name, pas.institution AS institution_name, pas.value AS current
     FROM portfolio_account_snapshots pas
     INNER JOIN plaid_items pi ON pi.item_id = pas.item_id AND pi.user_id = pas.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY pas.date ASC`,
    params
  )
  const decrypted = decryptRows(rows, { account_name: 'string', institution_name: 'string', current: 'number' })
  return decrypted.map(r => ({ ...r, type: 'investment', current: r.current ?? 0 }))
}

/** Returns the most recent portfolio value per investment account for a user. */
export async function getLatestInvestmentAccountBalances(userId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (account_id)
       account_id, account_name, institution AS institution_name, value AS current, date AS as_of_date
     FROM portfolio_account_snapshots
     INNER JOIN plaid_items pi ON pi.item_id = portfolio_account_snapshots.item_id AND pi.user_id = portfolio_account_snapshots.user_id
     WHERE portfolio_account_snapshots.user_id = $1
     ORDER BY account_id, date DESC`,
    [userId]
  )
  const decrypted = decryptRows(rows, { account_name: 'string', institution_name: 'string', current: 'number' })
  return decrypted.map(r => ({ ...r, type: 'investment', subtype: null, available: null, credit_limit: null, currency: 'USD' }))
}

export async function getAllUserIdsWithItems() {
  const res = await query(`SELECT DISTINCT user_id FROM plaid_items`)
  return res.rows.map((r) => r.user_id)
}

export async function insertBackfillPortfolioSnapshot(userId, date, totalValue) {
  await query(
    `INSERT INTO portfolio_snapshots (user_id, date, total_value, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date) DO NOTHING`,
    [userId, date, encryptNum(totalValue), encrypt('backfill')]
  )
}
