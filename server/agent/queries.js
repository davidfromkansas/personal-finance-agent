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
import { decryptRows } from '../lib/crypto.js'

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

  // Fetch all transactions in date range, decrypt, filter/aggregate in JS
  const { rows } = await query(
    `SELECT amount, account_name, personal_finance_category, personal_finance_category_detailed
     FROM transactions
     WHERE user_id = $1 AND date >= $2 AND date <= $3`,
    [userId, afterDate, beforeDate]
  )
  const decrypted = decryptRows(rows, { amount: 'number', account_name: 'string', personal_finance_category: 'string', personal_finance_category_detailed: 'string' })

  // Filter
  const filtered = decrypted.filter(r => {
    if (r.amount == null || r.amount <= 0) return false
    if (mergedPrimary.includes(r.personal_finance_category)) return false
    if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) return false
    if (category && (r.personal_finance_category || '').toUpperCase() !== category.toUpperCase()) return false
    return true
  })

  const round2 = (n) => Math.round(n * 100) / 100

  if (groupByAccount) {
    const accountMap = {}
    for (const r of filtered) {
      const acct = r.account_name || 'Unknown'
      const cat = r.personal_finance_category || 'OTHER'
      if (!accountMap[acct]) accountMap[acct] = {}
      if (!accountMap[acct][cat]) accountMap[acct][cat] = { total: 0, count: 0 }
      accountMap[acct][cat].total += r.amount
      accountMap[acct][cat].count++
    }
    const accounts = Object.entries(accountMap).map(([account, cats]) => {
      const categories = Object.entries(cats)
        .map(([category, { total, count }]) => ({ category, total: round2(total), transaction_count: count }))
        .sort((a, b) => b.total - a.total)
      const total = categories.reduce((s, c) => s + c.total, 0)
      return { account, total: round2(total), categories }
    }).sort((a, b) => b.total - a.total)
    const total = accounts.reduce((s, a) => s + a.total, 0)
    return { after_date: afterDate, before_date: beforeDate, total: round2(total), accounts }
  }

  // Group by category
  const catMap = {}
  for (const r of filtered) {
    const cat = r.personal_finance_category || 'OTHER'
    if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 }
    catMap[cat].total += r.amount
    catMap[cat].count++
  }
  const categories = Object.entries(catMap)
    .map(([category, { total, count }]) => ({ category, total: round2(total), transaction_count: count }))
    .sort((a, b) => b.total - a.total)
  const total = categories.reduce((s, c) => s + c.total, 0)
  return { after_date: afterDate, before_date: beforeDate, total: round2(total), categories }
}

/**
 * Transactions for an arbitrary date range, stripped to what the agent needs.
 * Returns [{ merchant, amount, date, category, account, pending }]
 * No row cap — bounded by the date range the agent provides.
 */
export async function getAgentTransactions(userId, { afterDate, beforeDate, category, spendingOnly } = {}) {
  // Only filter on plaintext columns (user_id, dates) in SQL
  const params = [userId]
  const clauses = []
  if (afterDate) { params.push(afterDate); clauses.push(`date >= $${params.length}`) }
  if (beforeDate) { params.push(beforeDate); clauses.push(`date <= $${params.length}`) }
  const where = clauses.length ? 'AND ' + clauses.join(' AND ') : ''

  const { rows } = await query(
    `SELECT name, amount, COALESCE(authorized_date, date)::text AS date,
            personal_finance_category, personal_finance_category_detailed,
            account_name, pending
     FROM transactions
     WHERE user_id = $1 ${where}
     ORDER BY COALESCE(authorized_date, date) DESC, created_at DESC`,
    params
  )

  const decrypted = decryptRows(rows, { name: 'string', amount: 'number', personal_finance_category: 'string', personal_finance_category_detailed: 'string', account_name: 'string', pending: 'bool' })

  // Filter encrypted fields in JS
  let filtered = decrypted
  if (category) {
    const upper = category.toUpperCase()
    filtered = filtered.filter(r => (r.personal_finance_category || '').toUpperCase() === upper)
  }
  if (spendingOnly) {
    filtered = filtered.filter(r => {
      if (NON_SPENDING_CATEGORIES.includes(r.personal_finance_category)) return false
      if (NON_SPENDING_DETAILED_CATEGORIES.includes(r.personal_finance_category_detailed)) return false
      return true
    })
  }

  return filtered.map(r => ({
    merchant: r.name,
    amount: r.amount != null ? Math.round(r.amount * 100) / 100 : null,
    date: r.date,
    category: r.personal_finance_category || 'OTHER',
    account: r.account_name || 'Unknown',
    pending: r.pending,
  }))
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
