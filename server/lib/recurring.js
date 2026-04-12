/**
 * Shared recurring transactions logic — used by MCP, the spending agent, and the calendar UI.
 * Fetches Plaid's detected recurring outflow streams + user-marked subscriptions from the DB,
 * deduplicates, and returns a merged list.
 */
import { getPlaidItemsByUserId, getSubscriptionPayments } from '../db.js'
import { getPlaidClient } from './plaidClient.js'
import { todayET, toDateStrET } from './dateUtils.js'

const FREQUENCY_DAYS = { WEEKLY: 7, BIWEEKLY: 14, SEMI_MONTHLY: 15, MONTHLY: 30, QUARTERLY: 91, YEARLY: 365, ANNUALLY: 365 }

/**
 * Fetch recurring bill/subscription outflows for a user.
 * Merges Plaid-detected streams with user-marked subscriptions, deduplicating by merchant + amount.
 * Returns sorted array of { merchant, average_amount, last_amount, frequency, predicted_next_date, last_date, category, status, source }
 */
export async function getRecurringTransactions(userId) {
  const items = await getPlaidItemsByUserId(userId)

  const plaidClient = getPlaidClient()
  const plaidPayments = []

  if (items.length > 0) {
    await Promise.allSettled(items.map(async (row) => {
      try {
        const result = await plaidClient.transactionsRecurringGet({
          access_token: row.access_token,
          options: { personal_finance_category_version: 'v2' },
        })
        const outflowStreams = result.data?.outflow_streams ?? []
        for (const stream of outflowStreams) {
          if (!stream.predicted_next_date) continue
          if ((stream.status ?? '') === 'TOMBSTONED') continue
          const pfc = stream.personal_finance_category ?? stream.personalFinanceCategory
          plaidPayments.push({
            merchant: stream.merchant_name ?? stream.description ?? 'Unknown',
            average_amount: stream.average_amount?.amount ?? stream.average_amount ?? 0,
            last_amount: stream.last_amount?.amount ?? stream.last_amount ?? 0,
            frequency: stream.frequency ?? 'UNKNOWN',
            predicted_next_date: stream.predicted_next_date,
            last_date: stream.last_date ?? null,
            category: typeof pfc === 'string' ? pfc : pfc?.primary ?? null,
            status: stream.status ?? 'UNKNOWN',
            source: 'plaid',
          })
        }
      } catch (err) {
        const code = err?.response?.data?.error_code
        if (code !== 'PRODUCT_NOT_READY' && code !== 'PRODUCT_NOT_SUPPORTED') {
          console.warn('[recurring] fetch failed for item:', err.message)
        }
      }
    }))
  }

  // Fetch user-marked subscriptions from the database
  const subscriptionRows = await getSubscriptionPayments(userId)
  const today = todayET()
  const userPayments = []

  for (const row of subscriptionRows) {
    const freqDays = FREQUENCY_DAYS[row.recurring] ?? 30
    const dateStr = row.date instanceof Date ? toDateStrET(row.date) : String(row.date).slice(0, 10)
    const lastDate = new Date(dateStr + 'T00:00:00')
    let nextDate = new Date(lastDate)
    while (toDateStrET(nextDate) < today) {
      nextDate.setDate(nextDate.getDate() + freqDays)
    }
    userPayments.push({
      merchant: row.merchant_name || row.name || 'Unknown',
      average_amount: Math.abs(row.amount),
      last_amount: Math.abs(row.amount),
      frequency: row.recurring,
      predicted_next_date: toDateStrET(nextDate),
      last_date: dateStr,
      category: 'SUBSCRIPTION',
      status: 'ACTIVE',
      source: 'user',
    })
  }

  // Deduplicate: skip user-marked entries that match a Plaid payment on amount + frequency
  const plaidKeys = new Set(plaidPayments.map((p) => {
    const amt = Math.round((p.last_amount ?? p.average_amount ?? 0) * 100)
    return `${amt}|${p.frequency}`
  }))
  const dedupedUser = userPayments.filter((s) => {
    const amt = Math.round((s.last_amount ?? 0) * 100)
    const key = `${amt}|${s.frequency}`
    return !plaidKeys.has(key)
  })

  const allPayments = [...plaidPayments, ...dedupedUser]
  allPayments.sort((a, b) => (a.predicted_next_date > b.predicted_next_date ? 1 : -1))
  return allPayments
}
