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
    `SELECT id, user_id, item_id, access_token, institution_name, last_synced_at, created_at
     FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  )
  return rows
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
      `INSERT INTO transactions (user_id, item_id, account_id, plaid_transaction_id, name, amount, date, account_name, payment_channel, personal_finance_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (plaid_transaction_id) DO UPDATE SET
         name = EXCLUDED.name, amount = EXCLUDED.amount, date = EXCLUDED.date,
         account_name = EXCLUDED.account_name, payment_channel = EXCLUDED.payment_channel,
         personal_finance_category = EXCLUDED.personal_finance_category`,
      [userId, itemId, t.account_id, t.transaction_id, t.name, t.amount, t.date, t.account_name ?? null, t.payment_channel ?? null, t.personal_finance_category ?? null]
    )
  }
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
    `SELECT id, plaid_transaction_id, name, amount, date, account_name, account_id, item_id
     FROM transactions WHERE user_id = $1 ORDER BY date DESC, created_at DESC LIMIT $2`,
    [userId, limit]
  )
  return rows
}

const NON_SPENDING_CATEGORIES = [
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  'BANK_FEES',
  'RENT_AND_UTILITIES',
]

export async function getSpendingSummary(userId, period, itemIds) {
  const hasItemFilter = Array.isArray(itemIds) && itemIds.length > 0
  const nextParam = hasItemFilter ? 4 : 3
  const itemClause = hasItemFilter ? 'AND item_id = ANY($3)' : ''
  const pfcClause = `AND (personal_finance_category IS NULL OR personal_finance_category != ALL($${nextParam}))`
  const params = hasItemFilter
    ? [userId, null, itemIds, NON_SPENDING_CATEGORIES]
    : [userId, null, NON_SPENDING_CATEGORIES]

  let sql
  if (period === 'week') {
    params[1] = 7
    sql = `
      SELECT date::text AS bucket, SUM(amount) AS total
      FROM transactions
      WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - ($2 || ' days')::interval
        ${itemClause} ${pfcClause}
      GROUP BY date ORDER BY date ASC`
  } else if (period === 'month') {
    params[1] = 28
    sql = `
      SELECT date_trunc('week', date)::date::text AS bucket, SUM(amount) AS total
      FROM transactions
      WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - ($2 || ' days')::interval
        ${itemClause} ${pfcClause}
      GROUP BY date_trunc('week', date) ORDER BY bucket ASC`
  } else {
    params[1] = 365
    sql = `
      SELECT to_char(date, 'YYYY-MM') AS bucket, SUM(amount) AS total
      FROM transactions
      WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - ($2 || ' days')::interval
        ${itemClause} ${pfcClause}
      GROUP BY to_char(date, 'YYYY-MM') ORDER BY bucket ASC`
  }

  const { rows } = await query(sql, params)
  return rows
}
