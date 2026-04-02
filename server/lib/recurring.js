/**
 * Shared recurring transactions logic — used by both MCP and the spending agent.
 * Fetches Plaid's detected recurring outflow streams for all linked items.
 */
import { getPlaidItemsByUserId } from '../db.js'
import { getPlaidClient } from './plaidClient.js'

/**
 * Fetch recurring bill/subscription outflows for a user.
 * Returns sorted array of { merchant, average_amount, last_amount, frequency, predicted_next_date, last_date, category, status }
 */
export async function getRecurringTransactions(userId) {
  const items = await getPlaidItemsByUserId(userId)
  if (items.length === 0) return []

  const plaidClient = getPlaidClient()
  const allPayments = []

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
        allPayments.push({
          merchant: stream.merchant_name ?? stream.description ?? 'Unknown',
          average_amount: stream.average_amount?.amount ?? stream.average_amount ?? 0,
          last_amount: stream.last_amount?.amount ?? stream.last_amount ?? 0,
          frequency: stream.frequency ?? 'UNKNOWN',
          predicted_next_date: stream.predicted_next_date,
          last_date: stream.last_date ?? null,
          category: typeof pfc === 'string' ? pfc : pfc?.primary ?? null,
          status: stream.status ?? 'UNKNOWN',
        })
      }
    } catch (err) {
      const code = err?.response?.data?.error_code
      if (code !== 'PRODUCT_NOT_READY' && code !== 'PRODUCT_NOT_SUPPORTED') {
        console.warn('[recurring] fetch failed for item:', err.message)
      }
    }
  }))

  allPayments.sort((a, b) => (a.predicted_next_date > b.predicted_next_date ? 1 : -1))
  return allPayments
}
