/**
 * Agent-specific DB queries. Imported by agent tool handlers.
 * All functions are scoped to userId — never trust user-supplied IDs.
 *
 * Exclusion lists mirror db.js exactly:
 *   NON_SPENDING_CATEGORIES      — primary-category exclusions
 *   NON_SPENDING_DETAILED_CATEGORIES — surgical detailed-category exclusions
 * Rent, utilities, and loan payments are real cash outflows and ARE counted as spending.
 * Only credit card payment settlements are excluded (they're captured on the card feed already).
 */
import { query } from '../db.js'
import { getMonthlyCashFlow, getCashFlowBreakdown, getCashFlowTimeSeries, getCashFlowNodeTransactions } from '../db.js'

const NON_SPENDING_CATEGORIES = [
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'BANK_FEES',
]

// Surgical detailed-category exclusions — mirrors db.js
const NON_SPENDING_DETAILED_CATEGORIES = [
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT',
  'LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT',
]

/**
 * Spending broken down by category for an arbitrary date range.
 * Returns { after_date, before_date, total, categories: [{ category, total, transaction_count }] }
 */
export async function getAgentSpendingSummary(userId, afterDate, beforeDate, category = null, excludeCategories = [], groupByAccount = false) {
  const mergedPrimary = excludeCategories.length > 0
    ? [...NON_SPENDING_CATEGORIES, ...excludeCategories]
    : NON_SPENDING_CATEGORIES
  const params = [userId, afterDate, beforeDate, mergedPrimary, NON_SPENDING_DETAILED_CATEGORIES]
  let categoryClause = ''
  if (category) {
    params.push(category.toUpperCase())
    categoryClause = `AND personal_finance_category = $${params.length}`
  }

  if (groupByAccount) {
    const { rows } = await query(
      `SELECT COALESCE(account_name, 'Unknown') AS account,
              COALESCE(personal_finance_category, 'OTHER') AS category,
              ROUND(SUM(amount)::numeric, 2) AS total,
              COUNT(*) AS transaction_count
       FROM transactions
       WHERE user_id = $1
         AND amount > 0
         AND date >= $2
         AND date <= $3
         AND (personal_finance_category IS NULL OR personal_finance_category != ALL($4))
         AND (personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($5))
         ${categoryClause}
       GROUP BY account_name, personal_finance_category
       ORDER BY account_name, total DESC`,
      params
    )
    // Group by account
    const accountMap = {}
    for (const r of rows) {
      if (!accountMap[r.account]) accountMap[r.account] = { account: r.account, total: 0, categories: [] }
      accountMap[r.account].total += parseFloat(r.total)
      accountMap[r.account].categories.push({ category: r.category, total: parseFloat(r.total), transaction_count: parseInt(r.transaction_count) })
    }
    const accounts = Object.values(accountMap).map(a => ({ ...a, total: Math.round(a.total * 100) / 100 })).sort((a, b) => b.total - a.total)
    const total = accounts.reduce((sum, a) => sum + a.total, 0)
    return { after_date: afterDate, before_date: beforeDate, total: Math.round(total * 100) / 100, accounts }
  }

  const { rows } = await query(
    `SELECT COALESCE(personal_finance_category, 'OTHER') AS category,
            ROUND(SUM(amount)::numeric, 2) AS total,
            COUNT(*) AS transaction_count
     FROM transactions
     WHERE user_id = $1
       AND amount > 0
       AND date >= $2
       AND date <= $3
       AND (personal_finance_category IS NULL OR personal_finance_category != ALL($4))
       AND (personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($5))
       ${categoryClause}
     GROUP BY personal_finance_category
     ORDER BY total DESC`,
    params
  )
  const total = rows.reduce((sum, r) => sum + parseFloat(r.total), 0)
  return { after_date: afterDate, before_date: beforeDate, total: Math.round(total * 100) / 100, categories: rows }
}

/**
 * Transactions for an arbitrary date range, stripped to what the agent needs.
 * Returns [{ merchant, amount, date, category, account, pending }]
 * No row cap — bounded by the date range the agent provides.
 */
export async function getAgentTransactions(userId, { afterDate, beforeDate, category, spendingOnly } = {}) {
  const params = [userId]
  const clauses = []
  if (afterDate) { params.push(afterDate); clauses.push(`date >= $${params.length}`) }
  if (beforeDate) { params.push(beforeDate); clauses.push(`date <= $${params.length}`) }
  if (category) { params.push(category.toUpperCase()); clauses.push(`personal_finance_category = $${params.length}`) }
  if (spendingOnly) {
    params.push(NON_SPENDING_CATEGORIES)
    clauses.push(`(personal_finance_category IS NULL OR personal_finance_category != ALL($${params.length}))`)
    params.push(NON_SPENDING_DETAILED_CATEGORIES)
    clauses.push(`(personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($${params.length}))`)
  }
  const where = clauses.length ? 'AND ' + clauses.join(' AND ') : ''
  const { rows } = await query(
    `SELECT name AS merchant,
            ROUND(amount::numeric, 2) AS amount,
            COALESCE(authorized_date, date)::text AS date,
            COALESCE(personal_finance_category, 'OTHER') AS category,
            COALESCE(account_name, 'Unknown') AS account,
            pending
     FROM transactions
     WHERE user_id = $1 ${where}
     ORDER BY COALESCE(authorized_date, date) DESC, created_at DESC`,
    params
  )
  return rows
}

/**
 * Monthly cash flow: inflows, outflows, net. Thin wrapper around db.getMonthlyCashFlow.
 * Returns [{ month: 'YYYY-MM', inflows, outflows, net }]
 */
export async function getAgentCashFlow(userId, monthsBack = 12, accountIds = null) {
  return getMonthlyCashFlow(userId, monthsBack, accountIds)
}

/**
 * Cash flow breakdown by category/group/merchant for a period.
 * Returns { period, breakdown, income: { total, categories }, expenses: { total, categories } }
 */
/**
 * Cash flow time series: inflows, outflows, net by day/week/month for a custom date range.
 * Returns { start_date, end_date, granularity, buckets: [{ bucket, inflows, outflows, net }] }
 */
export async function getAgentCashFlowTimeSeries(userId, startDate, endDate, granularity = 'month', accountIds = null) {
  const buckets = await getCashFlowTimeSeries(userId, startDate, endDate, granularity, accountIds)
  return { start_date: startDate, end_date: endDate, granularity, buckets }
}

/**
 * Drill into a single category/group/merchant node from the cash flow breakdown.
 * Returns { period, flow_type, category_key, transactions: [{ merchant, amount, date, account, category }] }
 */
export async function getAgentCashFlowNodeTransactions(userId, period, flowType, categoryKey, breakdown = 'category') {
  const rows = await getCashFlowNodeTransactions(userId, period, breakdown, flowType, categoryKey)
  const transactions = rows.map(r => ({
    merchant: r.merchant_name || r.name,
    amount: parseFloat(r.amount),
    date: r.authorized_date || r.date,
    account: r.account_name,
    category: r.personal_finance_category || 'OTHER',
    pending: r.pending,
  }))
  return { period, flow_type: flowType, category_key: categoryKey, breakdown, transaction_count: transactions.length, transactions }
}

export async function getAgentCashFlowBreakdown(userId, period = 'month', breakdown = 'category', accountIds = null, customRange = null, excludeCategories = []) {
  const rows = await getCashFlowBreakdown(userId, period, breakdown, accountIds, customRange, excludeCategories)
  const income = { total: 0, categories: [] }
  const expenses = { total: 0, categories: [] }
  for (const r of rows) {
    const entry = { name: r.category_key, amount: r.total_amount }
    if (r.flow_type === 'income') {
      income.total += r.total_amount
      income.categories.push(entry)
    } else {
      expenses.total += r.total_amount
      expenses.categories.push(entry)
    }
  }
  income.total = Math.round(income.total * 100) / 100
  expenses.total = Math.round(expenses.total * 100) / 100
  const net = Math.round((income.total - expenses.total) * 100) / 100
  const savingsRate = income.total > 0 ? Math.round((net / income.total) * 10000) / 100 : 0
  return { period, breakdown, income, expenses, net, savings_rate_percent: savingsRate }
}

/**
 * Compare cash flow between two arbitrary date ranges.
 * Returns headline numbers for both periods, deltas, and per-category changes sorted by largest absolute delta.
 */
export async function getAgentCashFlowComparison(userId, currentRange, previousRange, breakdown = 'category', excludeCategories = []) {
  const [current, previous] = await Promise.all([
    getAgentCashFlowBreakdown(userId, 'month', breakdown, null, currentRange, excludeCategories),
    getAgentCashFlowBreakdown(userId, 'month', breakdown, null, previousRange, excludeCategories),
  ])

  const round = (n) => Math.round(n * 100) / 100
  const pctChange = (cur, prev) => prev === 0 ? (cur === 0 ? 0 : 100) : round(((cur - prev) / prev) * 100)

  const delta = {
    income: round(current.income.total - previous.income.total),
    expenses: round(current.expenses.total - previous.expenses.total),
    net: round(current.net - previous.net),
    savings_rate: round(current.savings_rate_percent - previous.savings_rate_percent),
  }

  // Build category-level comparison (expenses only — that's what users care about most)
  const prevMap = new Map()
  for (const c of previous.expenses.categories) prevMap.set(c.name, c.amount)

  const categoryChanges = []
  const seenCategories = new Set()

  for (const c of current.expenses.categories) {
    const prev = prevMap.get(c.name) ?? 0
    seenCategories.add(c.name)
    categoryChanges.push({
      name: c.name,
      current: c.amount,
      previous: prev,
      delta: round(c.amount - prev),
      pct_change: pctChange(c.amount, prev),
    })
  }

  // Categories that existed in previous but not in current
  for (const c of previous.expenses.categories) {
    if (!seenCategories.has(c.name)) {
      categoryChanges.push({
        name: c.name,
        current: 0,
        previous: c.amount,
        delta: round(-c.amount),
        pct_change: -100,
      })
    }
  }

  // Sort by largest absolute delta
  categoryChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    current_period: currentRange,
    previous_period: previousRange,
    breakdown,
    current: {
      income: current.income.total,
      expenses: current.expenses.total,
      net: current.net,
      savings_rate: current.savings_rate_percent,
    },
    previous: {
      income: previous.income.total,
      expenses: previous.expenses.total,
      net: previous.net,
      savings_rate: previous.savings_rate_percent,
    },
    delta,
    category_changes: categoryChanges,
  }
}
