import pg from 'pg'

const { Pool } = pg

/**
 * Postgres access layer. All functions take userId (from req.uid); no ORM.
 * Used by server/routes/plaid.js for plaid_items, transactions, and aggregations.
 * Run migrations with: node server/run-migration.js
 */
let pool = null

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set. Add it to server/.env')
    pool = new Pool({ connectionString: url })
  }
  return pool
}

export async function query(text, params) {
  const client = await getPool().connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

export async function getPlaidItemByItemId(itemId) {
  const { rows } = await query(
    `SELECT id, user_id, item_id, access_token, institution_name, last_synced_at, created_at, accounts_cache
     FROM plaid_items WHERE item_id = $1 LIMIT 1`,
    [itemId]
  )
  return rows[0] ?? null
}

export async function getPlaidItemsByUserId(userId) {
  const { rows } = await query(
    `SELECT id, user_id, item_id, access_token, institution_name, institution_id, products_granted, last_synced_at, created_at, accounts_cache
     FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  )
  return rows
}

export async function getPlaidItemByInstitutionId(userId, institutionId) {
  const { rows } = await query(
    `SELECT item_id, institution_name FROM plaid_items WHERE user_id = $1 AND institution_id = $2 LIMIT 1`,
    [userId, institutionId]
  )
  return rows[0] ?? null
}

export async function updateAccountsCache(userId, itemId, accountsJson) {
  await query(
    `UPDATE plaid_items SET accounts_cache = $3 WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId, JSON.stringify(accountsJson)]
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
    [userId, itemId, accessToken, institutionName ?? null, institutionId ?? null, productsGranted ?? null, lastSyncedAt ?? new Date()]
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
  return rows[0] ?? null
}

export async function getSyncCursor(userId, itemId) {
  const { rows } = await query(
    `SELECT sync_cursor FROM plaid_items WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId]
  )
  return rows[0]?.sync_cursor ?? null
}

export async function updateSyncCursor(userId, itemId, cursor) {
  await query(
    `UPDATE plaid_items SET sync_cursor = $3, last_synced_at = NOW() WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId, cursor]
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
      [userId, itemId, t.account_id, t.transaction_id, t.name, t.amount, t.date, t.authorized_date ?? null, t.account_name ?? null, t.payment_channel ?? null, t.personal_finance_category ?? null, t.pending === true, t.logo_url ?? null, t.original_description ?? null, t.merchant_name ?? null, t.location ? JSON.stringify(t.location) : null, t.website ?? null, t.personal_finance_category_detailed ?? null, t.personal_finance_category_confidence ?? null, t.counterparties?.length ? JSON.stringify(t.counterparties) : null, t.payment_meta ? JSON.stringify(t.payment_meta) : null, t.check_number ?? null]
    )
  }
}

export async function updateTransactionAccountNames(userId, accountId, accountName) {
  await query(
    `UPDATE transactions SET account_name = $3 WHERE user_id = $1 AND account_id = $2 AND (account_name IS DISTINCT FROM $3)`,
    [userId, accountId, accountName]
  )
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
  for (const r of rows) map[r.plaid_transaction_id] = r.logo_url
  return map
}

const reportedDateExpr = 'COALESCE(authorized_date, date)'
const TX_SELECT = `SELECT id, plaid_transaction_id, name, amount, date::text, authorized_date::text, account_name, account_id, item_id, pending, logo_url, payment_channel, personal_finance_category, original_description, merchant_name, location, website, personal_finance_category_detailed, personal_finance_category_confidence, counterparties, payment_meta, check_number FROM transactions`

export async function getRecentTransactions(userId, limit = 25, { beforeDate, afterDate, fromDate, toDate, accountIds, categories, sort = 'recent', offset = 0 } = {}) {
  // params shared by both queries — $1 = userId, $2+ = filter values only (no limit/offset)
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

  if (categories?.length) {
    conditions.push(`personal_finance_category = ANY($${p++})`)
    params.push(categories)
  }

  const orderBy = sort === 'oldest'      ? `${reportedDateExpr} ASC, created_at ASC`
               : sort === 'amount_desc'  ? `amount DESC, ${reportedDateExpr} DESC`
               : sort === 'amount_asc'   ? `amount ASC, ${reportedDateExpr} DESC`
               :                          `${reportedDateExpr} DESC, created_at DESC`

  const where = conditions.join(' AND ')
  // Inline limit/offset as integers (safe — values come from parseInt server-side)
  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(`${TX_SELECT} WHERE ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*)::int AS total FROM transactions WHERE ${where}`, params),
  ])
  return { transactions: rows, total: countRows[0].total }
}

export async function getTransactionAccounts(userId) {
  const { rows } = await query(
    `SELECT DISTINCT account_id, account_name
     FROM transactions
     WHERE user_id = $1 AND account_name IS NOT NULL
     ORDER BY account_name`,
    [userId]
  )
  return rows
}

export async function getTransactionCategories(userId) {
  const { rows } = await query(
    `SELECT DISTINCT personal_finance_category
     FROM transactions
     WHERE user_id = $1 AND personal_finance_category IS NOT NULL
     ORDER BY personal_finance_category`,
    [userId]
  )
  return rows.map(r => r.personal_finance_category)
}

export async function getTransactionsForNetWorth(userId, sinceDate) {
  const { rows } = await query(
    `SELECT account_id, amount, date::text AS date
     FROM transactions
     WHERE user_id = $1 AND date >= $2
     ORDER BY account_id, date ASC`,
    [userId, sinceDate]
  )
  return rows
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

export async function getSpendingSummaryByAccount(userId, period, accountIds) {
  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  const primaryParam = hasFilter ? 4 : 3
  const detailedParam = primaryParam + 1
  const filterClause = hasFilter ? 'AND account_id = ANY($3)' : ''
  const pfcClause = `AND (personal_finance_category IS NULL OR personal_finance_category != ALL($${primaryParam}))
      AND (personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($${detailedParam}))`
  const params = hasFilter
    ? [userId, null, accountIds, NON_SPENDING_CATEGORIES, NON_SPENDING_DETAILED_CATEGORIES]
    : [userId, null, NON_SPENDING_CATEGORIES, NON_SPENDING_DETAILED_CATEGORIES]

  const txDate = 'COALESCE(authorized_date, date)'
  const pad2 = (n) => String(n).padStart(2, '0')
  const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  let bucketExpr, groupExpr, dateFilter
  if (period === 'week') {
    // Pass start date from JS so the filter uses the same clock as the allKeys array in the route
    const start = new Date()
    start.setDate(start.getDate() - 6)
    params[1] = fmtDate(start)
    bucketExpr = `(${txDate})::text`
    groupExpr = txDate
    dateFilter = `${txDate} >= $2::date`
  } else if (period === 'month') {
    const start = new Date()
    start.setDate(start.getDate() - 28)
    params[1] = fmtDate(start)
    bucketExpr = `date_trunc('week', ${txDate})::date::text`
    groupExpr = `date_trunc('week', ${txDate})`
    dateFilter = `${txDate} >= $2::date`
  } else {
    // Month-aligned: start from the 1st of the month 11 months ago so each bar
    // covers a complete calendar month (Jan 1–Jan 31, Feb 1–Feb 28, etc.)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    params[1] = `${startOfMonth.getFullYear()}-${pad2(startOfMonth.getMonth() + 1)}-01`
    bucketExpr = `to_char(${txDate}, 'YYYY-MM')`
    groupExpr = `to_char(${txDate}, 'YYYY-MM')`
    dateFilter = `${txDate} >= $2::date`
  }

  const sql = `
    SELECT ${bucketExpr} AS bucket,
           COALESCE(account_name, 'Unknown') AS account_name,
           SUM(amount) AS total
    FROM transactions
    WHERE user_id = $1
      AND ${dateFilter}
      ${filterClause} ${pfcClause}
    GROUP BY ${groupExpr}, account_name
    ORDER BY bucket ASC, account_name ASC`

  const { rows } = await query(sql, params)
  return rows
}

// Inter-account transfers excluded from cash flow to avoid double-counting
// (e.g. savings → checking shows as both inflow and outflow).
const CASH_FLOW_EXCLUDED_CATEGORIES = ['TRANSFER_IN', 'TRANSFER_OUT']

/** Monthly cash flow: inflows (credits), outflows (debits), net. Plaid: positive = out, negative = in. */
export async function getMonthlyCashFlow(userId, months = 24) {
  const n = Math.min(Math.max(months, 1), 36)
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', COALESCE(authorized_date, date)), 'YYYY-MM') AS month,
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS inflows,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS outflows
     FROM transactions
     WHERE user_id = $1
       AND (personal_finance_category IS NULL OR personal_finance_category != ALL($3))
       AND (personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($4))
     GROUP BY date_trunc('month', COALESCE(authorized_date, date))
     ORDER BY month DESC
     LIMIT $2`,
    [userId, n, CASH_FLOW_EXCLUDED_CATEGORIES, NON_SPENDING_DETAILED_CATEGORIES]
  )
  return rows.map((r) => ({
    month: r.month,
    inflows: parseFloat(r.inflows) || 0,
    outflows: parseFloat(r.outflows) || 0,
    net: (parseFloat(r.inflows) || 0) - (parseFloat(r.outflows) || 0),
  }))
}

/** Transactions for a given month (YYYY-MM), split into inflows and outflows. Same exclusions as getMonthlyCashFlow. */
export async function getCashFlowTransactions(userId, month) {
  const { rows } = await query(
    `${TX_SELECT}
     WHERE user_id = $1
       AND to_char(date_trunc('month', COALESCE(authorized_date, date)), 'YYYY-MM') = $2
       AND (personal_finance_category IS NULL OR personal_finance_category != ALL($3))
       AND (personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($4))
     ORDER BY COALESCE(authorized_date, date) DESC, created_at DESC`,
    [userId, month, CASH_FLOW_EXCLUDED_CATEGORIES, NON_SPENDING_DETAILED_CATEGORIES]
  )
  const inflows = rows.filter(r => Number(r.amount) < 0)
  const outflows = rows.filter(r => Number(r.amount) > 0)
  return { inflows, outflows }
}

// ── Investment snapshot writes ─────────────────────────────────────────────

/** Upsert today's total portfolio value. Live writes overwrite; backfill never overwrites live. */
export async function upsertPortfolioSnapshot(userId, date, totalValue, source) {
  await query(
    `INSERT INTO portfolio_snapshots (user_id, date, total_value, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date) DO UPDATE
       SET total_value = EXCLUDED.total_value,
           source = EXCLUDED.source
     WHERE portfolio_snapshots.source = 'backfill' OR EXCLUDED.source = 'live'`,
    [userId, date, totalValue, source]
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
           source = EXCLUDED.source
     WHERE portfolio_account_snapshots.source = 'backfill' OR EXCLUDED.source = 'live'`,
    [userId, date, itemId, accountId, accountName, institution, value, source]
  )
}

/** Upsert today's per-security holding for one account. */
export async function upsertHoldingSnapshot(userId, date, itemId, accountId, accountName, institution, securityId, ticker, securityName, securityType, quantity, price, value, costBasis, currency, source) {
  await query(
    `INSERT INTO holdings_snapshots
       (user_id, date, item_id, account_id, account_name, institution, security_id, ticker, security_name, security_type, quantity, price, value, cost_basis, currency, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (user_id, date, account_id, security_id) DO UPDATE
       SET quantity = EXCLUDED.quantity,
           price = EXCLUDED.price,
           value = EXCLUDED.value,
           cost_basis = EXCLUDED.cost_basis,
           source = EXCLUDED.source`,
    [userId, date, itemId, accountId, accountName, institution, securityId, ticker, securityName, securityType, quantity, price, value, costBasis, currency, source]
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
    [securityId, ticker, name, type, currency ?? 'USD']
  )
}

/** Insert investment transactions; skip duplicates (idempotent). */
export async function upsertInvestmentTransactions(txns) {
  for (const t of txns) {
    await query(
      `INSERT INTO investment_transactions
         (user_id, item_id, account_id, institution, account_name, plaid_investment_txn_id, date, type, subtype, security_id, ticker, security_name, security_type, quantity, price, amount, fees, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (plaid_investment_txn_id) DO NOTHING`,
      [t.user_id, t.item_id, t.account_id, t.institution, t.account_name, t.plaid_investment_txn_id, t.date, t.type, t.subtype, t.security_id, t.ticker, t.security_name, t.security_type, t.quantity, t.price, t.amount, t.fees, t.currency ?? 'USD']
    )
  }
}

// ── Investment snapshot reads ──────────────────────────────────────────────

/** Read portfolio_snapshots for the chart. Returns only dates that exist — no fill. */
export async function getPortfolioHistory(userId, sinceDate) {
  const { rows } = await query(
    `SELECT date::text AS date, total_value AS value, source
     FROM portfolio_snapshots
     WHERE user_id = $1 AND date >= $2
     ORDER BY date ASC`,
    [userId, sinceDate]
  )
  return rows.map((r) => ({ date: r.date, value: parseFloat(r.value), source: r.source }))
}

/** Read portfolio_account_snapshots filtered by account IDs. Sums per day. */
export async function getPortfolioAccountHistory(userId, sinceDate, accountIds) {
  const { rows } = await query(
    `SELECT date::text AS date, SUM(value) AS value
     FROM portfolio_account_snapshots
     WHERE user_id = $1 AND date >= $2 AND account_id = ANY($3)
     GROUP BY date
     ORDER BY date ASC`,
    [userId, sinceDate, accountIds]
  )
  return rows.map((r) => ({ date: r.date, value: parseFloat(r.value) }))
}

/** Daily price history per ticker — used by the Portfolio Movers chart. */
export async function getHoldingsHistory(userId, sinceDate) {
  const { rows } = await query(
    `SELECT date, ticker, MIN(security_name) AS security_name, MIN(security_type) AS security_type, MAX(price) AS price
     FROM holdings_snapshots
     WHERE user_id = $1 AND date >= $2 AND price IS NOT NULL AND price > 0 AND ticker IS NOT NULL
     GROUP BY date, ticker
     ORDER BY ticker, date`,
    [userId, sinceDate]
  )
  return rows.map((r) => ({
    date: r.date,
    ticker: r.ticker,
    security_name: r.security_name,
    security_type: r.security_type,
    price: parseFloat(r.price),
  }))
}

/** Holdings snapshot for a specific date — used by the chart click side panel. */
export async function getHoldingsSnapshotForDate(userId, date) {
  const { rows } = await query(
    `SELECT account_id, account_name, institution, ticker, security_name, security_type,
            quantity, price, value, cost_basis, currency
     FROM holdings_snapshots
     WHERE user_id = $1 AND date = $2
     ORDER BY value DESC NULLS LAST`,
    [userId, date]
  )
  return rows.map((r) => ({
    account_id: r.account_id,
    account_name: r.account_name,
    institution: r.institution,
    ticker: r.ticker,
    security_name: r.security_name,
    security_type: r.security_type,
    quantity: r.quantity != null ? parseFloat(r.quantity) : null,
    price: r.price != null ? parseFloat(r.price) : null,
    value: r.value != null ? parseFloat(r.value) : null,
    cost_basis: r.cost_basis != null ? parseFloat(r.cost_basis) : null,
    currency: r.currency,
  }))
}

/** Latest portfolio snapshot value for a user (used as current value). */
export async function getLatestPortfolioValue(userId) {
  const { rows } = await query(
    `SELECT total_value FROM portfolio_snapshots
     WHERE user_id = $1
     ORDER BY date DESC LIMIT 1`,
    [userId]
  )
  return rows[0] ? parseFloat(rows[0].total_value) : null
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
  const { rows } = await query(
    `SELECT 1 FROM portfolio_snapshots
     WHERE user_id = $1 AND date = $2 AND source = 'live'
     LIMIT 1`,
    [userId, today]
  )
  return rows.length > 0
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
  return rows
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
      account.name, institutionName ?? null, date,
      account.current ?? null, account.available ?? null, account.limit ?? null,
      account.type ?? null, account.subtype ?? null, account.currency ?? 'USD',
    ]
  )
}

/** Get balance history for all accounts belonging to a user, ordered by date ascending. */
export async function getAccountBalanceHistory(userId, { afterDate, beforeDate } = {}) {
  const conditions = ['user_id = $1']
  const params = [userId]
  if (afterDate) { params.push(afterDate); conditions.push(`date >= $${params.length}`) }
  if (beforeDate) { params.push(beforeDate); conditions.push(`date <= $${params.length}`) }
  const { rows } = await query(
    `SELECT date, account_id, account_name, institution_name, type, subtype,
            current, available, credit_limit, currency
     FROM account_balance_snapshots
     WHERE ${conditions.join(' AND ')}
     ORDER BY date ASC, account_name ASC`,
    params
  )
  return rows
}

export async function getAllUserIdsWithItems() {
  const res = await query(`SELECT DISTINCT user_id FROM plaid_items`)
  return res.rows.map((r) => r.user_id)
}

export async function insertBackfillPortfolioSnapshot(userId, date, totalValue) {
  await query(
    `INSERT INTO portfolio_snapshots (user_id, date, total_value, source)
     VALUES ($1, $2, $3, 'backfill')
     ON CONFLICT (user_id, date) DO NOTHING`,
    [userId, date, totalValue]
  )
}
