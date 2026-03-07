/**
 * snapshotInvestments(userId)
 *
 * Fetches current investment holdings from Plaid for all connected items and writes
 * ground-truth snapshots to the DB. Called on-demand from the portfolio-history endpoint
 * today; designed to also be callable from a cron job in the future.
 *
 * Writes today's row to:
 *   - portfolio_snapshots (total value)
 *   - portfolio_account_snapshots (per account)
 *   - holdings_snapshots (per security per account)
 *   - securities (metadata cache)
 *
 * Also syncs recent investment_transactions for all items.
 */
import { getPlaidClient } from '../lib/plaidClient.js'
import {
  getPlaidItemsByUserId,
  upsertPortfolioSnapshot,
  upsertPortfolioAccountSnapshot,
  upsertHoldingSnapshot,
  upsertSecurity,
  upsertInvestmentTransactions,
} from '../db.js'

const SKIP_CODES = [
  'PRODUCTS_NOT_SUPPORTED',
  'NO_INVESTMENT_ACCOUNTS',
  'CONSENT_NOT_GRANTED',
  'ADDITIONAL_CONSENT_REQUIRED',
  'ITEM_LOGIN_REQUIRED',
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export async function snapshotInvestments(userId) {
  const items = await getPlaidItemsByUserId(userId)
  const plaidClient = getPlaidClient()
  const date = todayStr()
  let grandTotal = 0

  for (const item of items) {
    try {
      const holdRes = await plaidClient.investmentsHoldingsGet({ access_token: item.access_token })

      const accountMap = {}
      for (const a of holdRes.data.accounts ?? []) {
        accountMap[a.account_id] = {
          name: a.official_name || a.name || 'Account',
          value: a.balances?.current ?? 0,
        }
      }

      const securityMap = {}
      for (const s of holdRes.data.securities ?? []) {
        securityMap[s.security_id] = {
          ticker: s.ticker_symbol ?? null,
          name: s.name ?? 'Unknown Security',
          type: s.type ?? null,
          currency: s.iso_currency_code ?? 'USD',
        }
      }

      // Upsert securities metadata
      for (const [secId, sec] of Object.entries(securityMap)) {
        upsertSecurity(secId, sec.ticker, sec.name, sec.type, sec.currency).catch(() => {})
      }

      // Aggregate per-account values from holdings (more accurate than balance for investment accounts)
      const accountValues = {}
      for (const h of holdRes.data.holdings ?? []) {
        const value = h.institution_value ?? 0
        accountValues[h.account_id] = (accountValues[h.account_id] ?? 0) + value
      }

      // Write holdings_snapshots
      for (const h of holdRes.data.holdings ?? []) {
        const sec = securityMap[h.security_id] ?? {}
        const value = h.institution_value ?? (h.quantity ?? 0) * (h.institution_price ?? 0)
        await upsertHoldingSnapshot(
          userId, date, item.item_id, h.account_id,
          accountMap[h.account_id]?.name ?? 'Account',
          item.institution_name ?? 'Unknown',
          h.security_id, sec.ticker, sec.name, sec.type,
          h.quantity ?? null, h.institution_price ?? null, value,
          h.cost_basis ?? null, sec.currency ?? 'USD', 'live'
        )
      }

      // Write portfolio_account_snapshots
      for (const [accountId, value] of Object.entries(accountValues)) {
        await upsertPortfolioAccountSnapshot(
          userId, date, item.item_id, accountId,
          accountMap[accountId]?.name ?? 'Account',
          item.institution_name ?? 'Unknown',
          value, 'live'
        )
        grandTotal += value
      }

      // Sync recent investment_transactions
      try {
        const txnRes = await plaidClient.investmentsTransactionsGet({
          access_token: item.access_token,
          start_date: ninetyDaysAgo(),
          end_date: date,
        })
        const secMap = securityMap
        for (const s of txnRes.data.securities ?? []) {
          secMap[s.security_id] = {
            ticker: s.ticker_symbol ?? null,
            name: s.name ?? 'Unknown Security',
            type: s.type ?? null,
            currency: s.iso_currency_code ?? 'USD',
          }
        }
        const txnsToInsert = (txnRes.data.investment_transactions ?? []).map((t) => {
          const sec = secMap[t.security_id] ?? {}
          return {
            user_id: userId,
            item_id: item.item_id,
            account_id: t.account_id,
            institution: item.institution_name ?? 'Unknown',
            account_name: accountMap[t.account_id]?.name ?? 'Account',
            plaid_investment_txn_id: t.investment_transaction_id,
            date: t.date,
            type: t.type ?? null,
            subtype: t.subtype ?? null,
            security_id: t.security_id ?? null,
            ticker: sec.ticker ?? null,
            security_name: sec.name ?? null,
            security_type: sec.type ?? null,
            quantity: t.quantity ?? null,
            price: t.price ?? null,
            amount: t.amount ?? null,
            fees: t.fees ?? null,
            currency: t.iso_currency_code ?? 'USD',
          }
        })
        await upsertInvestmentTransactions(txnsToInsert)
      } catch (txnErr) {
        const code = txnErr.response?.data?.error_code
        if (!SKIP_CODES.includes(code)) {
          console.error(`[snapshotInvestments] investment_transactions sync failed for item ${item.item_id}:`, txnErr.response?.data ?? txnErr.message)
        }
      }

    } catch (err) {
      const code = err.response?.data?.error_code
      if (SKIP_CODES.includes(code)) {
        console.log(`[snapshotInvestments] skipped item ${item.item_id} (${item.institution_name}): ${code}`)
        continue
      }
      console.error(`[snapshotInvestments] investmentsHoldingsGet failed for item ${item.item_id}:`, err.response?.data ?? err.message)
    }
  }

  // Write total portfolio snapshot
  if (grandTotal > 0) {
    await upsertPortfolioSnapshot(userId, date, grandTotal, 'live')
  }
}

function ninetyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}
