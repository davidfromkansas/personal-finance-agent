/**
 * snapshotBalances(userId)
 *
 * Fetches current account balances from Plaid for all transaction-product items
 * and writes daily snapshots to account_balance_snapshots. Investment-only items
 * are skipped — their values are captured by snapshotInvestments.
 *
 * Writes today's row to:
 *   - account_balance_snapshots (per account: current, available, credit_limit)
 *
 * Uses accountsBalanceGet for accurate live balances, with accountsGet fallback
 * on BALANCE_LIMIT errors (same pattern as _callPlaid in routes/plaid.js).
 */
import { getPlaidClient } from '../lib/plaidClient.js'
import { getPlaidItemsByUserId, upsertAccountBalanceSnapshot } from '../db.js'
import { todayET } from '../lib/dateUtils.js'

const SKIP_CODES = [
  'ITEM_LOGIN_REQUIRED',
  'INVALID_ACCESS_TOKEN',
  'CONSENT_NOT_GRANTED',
  'ADDITIONAL_CONSENT_REQUIRED',
  'INSTITUTION_DOWN',
  'INSTITUTION_NOT_RESPONDING',
]

const BALANCE_LIMIT_CODE = 'BALANCE_LIMIT'

/** @param {string} userId */
export async function snapshotBalances(userId) {
  const items = await getPlaidItemsByUserId(userId)
  const plaidClient = getPlaidClient()
  const date = todayET()

  for (const item of items) {
    // Skip investment-only items — their account values come from snapshotInvestments
    const products = item.products_granted ?? []
    if (!products.includes('transactions')) continue

    let accounts = null

    try {
      const res = await plaidClient.accountsBalanceGet({ access_token: item.access_token })
      accounts = res.data.accounts
    } catch (err) {
      const code = err.response?.data?.error_code
      if (SKIP_CODES.includes(code)) {
        console.log(`[snapshotBalances] skipped item ${item.item_id} (${item.institution_name}): ${code}`)
        continue
      }
      if (code === BALANCE_LIMIT_CODE) {
        // Fall back to accountsGet (Plaid-cached, slightly less fresh)
        try {
          const fallback = await plaidClient.accountsGet({ access_token: item.access_token })
          accounts = fallback.data.accounts
        } catch (fallbackErr) {
          console.error(`[snapshotBalances] accountsGet fallback failed for item ${item.item_id}:`, fallbackErr.response?.data ?? fallbackErr.message)
          continue
        }
      } else {
        console.error(`[snapshotBalances] accountsBalanceGet failed for item ${item.item_id} (${item.institution_name}):`, code ?? err.message)
        continue
      }
    }

    for (const acc of accounts ?? []) {
      upsertAccountBalanceSnapshot(userId, item.item_id, item.institution_name ?? null, {
        account_id: acc.account_id,
        name: acc.official_name || acc.name || 'Account',
        type: (acc.type || 'other').toLowerCase(),
        subtype: acc.subtype ?? null,
        current: acc.balances?.current ?? null,
        available: acc.balances?.available ?? null,
        limit: acc.balances?.limit ?? null,
        currency: acc.balances?.iso_currency_code ?? 'USD',
      }, date).catch((err) => console.error(`[snapshotBalances] upsert failed for account ${acc.account_id}:`, err.message))
    }
  }
}
