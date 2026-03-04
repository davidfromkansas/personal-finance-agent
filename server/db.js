import pg from 'pg'

const { Pool } = pg

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

export async function getPlaidItemsByUserId(userId) {
  const { rows } = await query(
    `SELECT id, user_id, item_id, access_token, institution_name, last_synced_at, created_at, accounts_cache
     FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  )
  return rows
}

export async function updateAccountsCache(userId, itemId, accountsJson) {
  await query(
    `UPDATE plaid_items SET accounts_cache = $3 WHERE user_id = $1 AND item_id = $2`,
    [userId, itemId, JSON.stringify(accountsJson)]
  )
}

export async function upsertPlaidItem({ userId, itemId, accessToken, institutionName, lastSyncedAt }) {
  await query(
    `INSERT INTO plaid_items (user_id, item_id, access_token, institution_name, last_synced_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, item_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       institution_name = COALESCE(EXCLUDED.institution_name, plaid_items.institution_name),
       last_synced_at = COALESCE(EXCLUDED.last_synced_at, plaid_items.last_synced_at)`,
    [userId, itemId, accessToken, institutionName ?? null, lastSyncedAt ?? new Date()]
  )
}

export async function deletePlaidItem(userId, itemId) {
  await query(`DELETE FROM transactions WHERE user_id = $1 AND item_id = $2`, [userId, itemId])
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

export async function upsertTransactions(userId, itemId, txns) {
  if (!txns.length) return
  for (const t of txns) {
    await query(
      `INSERT INTO transactions (user_id, item_id, account_id, plaid_transaction_id, name, amount, date, account_name, payment_channel, personal_finance_category, pending)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (plaid_transaction_id) DO UPDATE SET
         name = EXCLUDED.name, amount = EXCLUDED.amount, date = EXCLUDED.date,
         account_name = EXCLUDED.account_name, payment_channel = EXCLUDED.payment_channel,
         personal_finance_category = EXCLUDED.personal_finance_category, pending = EXCLUDED.pending`,
      [userId, itemId, t.account_id, t.transaction_id, t.name, t.amount, t.date, t.account_name ?? null, t.payment_channel ?? null, t.personal_finance_category ?? null, t.pending === true]
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

export async function getRecentTransactions(userId, limit = 25) {
  const { rows } = await query(
    `SELECT id, plaid_transaction_id, name, amount, date, account_name, account_id, item_id, pending
     FROM transactions WHERE user_id = $1 ORDER BY date DESC, created_at DESC LIMIT $2`,
    [userId, limit]
  )
  return rows
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

const NON_SPENDING_CATEGORIES = [
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  'BANK_FEES',
  'RENT_AND_UTILITIES',
]

export async function getSpendingSummaryByAccount(userId, period, accountIds) {
  const hasFilter = Array.isArray(accountIds) && accountIds.length > 0
  const nextParam = hasFilter ? 4 : 3
  const filterClause = hasFilter ? 'AND account_id = ANY($3)' : ''
  const pfcClause = `AND (personal_finance_category IS NULL OR personal_finance_category != ALL($${nextParam}))`
  const params = hasFilter
    ? [userId, null, accountIds, NON_SPENDING_CATEGORIES]
    : [userId, null, NON_SPENDING_CATEGORIES]

  let bucketExpr, groupExpr
  if (period === 'week') {
    params[1] = 6 // 7 calendar days: today-6 through today
    bucketExpr = 'date::text'
    groupExpr = 'date'
  } else if (period === 'month') {
    params[1] = 28
    bucketExpr = "date_trunc('week', date)::date::text"
    groupExpr = "date_trunc('week', date)"
  } else {
    params[1] = 365
    bucketExpr = "to_char(date, 'YYYY-MM')"
    groupExpr = "to_char(date, 'YYYY-MM')"
  }

  const sql = `
    SELECT ${bucketExpr} AS bucket,
           COALESCE(account_name, 'Unknown') AS account_name,
           SUM(amount) AS total
    FROM transactions
    WHERE user_id = $1 AND amount > 0
      AND date >= CURRENT_DATE - ($2 || ' days')::interval
      ${filterClause} ${pfcClause}
    GROUP BY ${groupExpr}, account_name
    ORDER BY bucket ASC, account_name ASC`

  const { rows } = await query(sql, params)
  return rows
}
