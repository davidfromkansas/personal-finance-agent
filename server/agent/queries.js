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
import { getMonthlyCashFlow } from '../db.js'

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
export async function getAgentSpendingSummary(userId, afterDate, beforeDate, category = null) {
  const params = [userId, afterDate, beforeDate, NON_SPENDING_CATEGORIES, NON_SPENDING_DETAILED_CATEGORIES]
  let categoryClause = ''
  if (category) {
    params.push(category.toUpperCase())
    categoryClause = `AND personal_finance_category = $${params.length}`
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
export async function getAgentCashFlow(userId, monthsBack = 12) {
  return getMonthlyCashFlow(userId, monthsBack)
}
