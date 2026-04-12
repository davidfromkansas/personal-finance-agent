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

import { todayET, toDateStrET } from '../lib/dateUtils.js'

// Items that never had investment data — skip silently
const SILENT_SKIP_CODES = [
  'PRODUCTS_NOT_SUPPORTED',
  'NO_INVESTMENT_ACCOUNTS',
]

// Items that should have investment data but can't sync — flag as unavailable
const UNAVAILABLE_CODES = [
  'ITEM_LOGIN_REQUIRED',
  'NO_ACCOUNTS',
  'CONSENT_NOT_GRANTED',
  'ADDITIONAL_CONSENT_REQUIRED',
]

const RATE_LIMIT_CODES = ['RATE_LIMIT_EXCEEDED']

/** @param {string} userId
 *  @param {{ daysBack?: number }} options - daysBack defaults to 90; pass 730 on initial connection */
export async function snapshotInvestments(userId, { daysBack = 90 } = {}) {
  const items = await getPlaidItemsByUserId(userId)
  const plaidClient = getPlaidClient()
  const date = todayET()
  let grandTotal = 0
  const unavailableItems = []

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

      // Write holdings_snapshots (track lot index for multiple lots of same security in same account)
      const lotCounters = {}
      for (const h of holdRes.data.holdings ?? []) {
        const sec = securityMap[h.security_id] ?? {}
        const value = h.institution_value ?? (h.quantity ?? 0) * (h.institution_price ?? 0)
        const lotKey = `${h.account_id}:${h.security_id}`
        const lotIndex = lotCounters[lotKey] ?? 0
        lotCounters[lotKey] = lotIndex + 1
        await upsertHoldingSnapshot(
          userId, date, item.item_id, h.account_id,
          accountMap[h.account_id]?.name ?? 'Account',
          item.institution_name ?? 'Unknown',
          h.security_id, sec.ticker, sec.name, sec.type,
          h.quantity ?? null, h.institution_price ?? null, value,
          h.cost_basis ?? null, sec.currency ?? 'USD', 'live', lotIndex
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
          start_date: daysAgo(daysBack),
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
        if (![...SILENT_SKIP_CODES, ...UNAVAILABLE_CODES].includes(code)) {
          console.error(`[snapshotInvestments] investment_transactions sync failed for item ${item.item_id}:`, txnErr.response?.data ?? txnErr.message)
        }
      }

    } catch (err) {
      const code = err.response?.data?.error_code
      if (SILENT_SKIP_CODES.includes(code)) {
        console.log(`[snapshotInvestments] skipped item ${item.item_id} (${item.institution_name}): ${code}`)
        continue
      }
      if (UNAVAILABLE_CODES.includes(code)) {
        console.log(`[snapshotInvestments] unavailable item ${item.item_id} (${item.institution_name}): ${code}`)
        unavailableItems.push({ institution_name: item.institution_name ?? 'Unknown', error_code: code })
        continue
      }
      if (RATE_LIMIT_CODES.includes(code)) {
        console.error(`[snapshotInvestments] RATE LIMITED by Plaid for item ${item.item_id} (${item.institution_name}) — snapshot skipped for this item`)
      } else {
        console.error(`[snapshotInvestments] investmentsHoldingsGet failed for item ${item.item_id} (${item.institution_name}): ${code ?? err.message}`)
      }
    }
  }

  // Write total portfolio snapshot
  if (grandTotal > 0) {
    await upsertPortfolioSnapshot(userId, date, grandTotal, 'live', unavailableItems.length > 0 ? unavailableItems : null)
  }
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateStrET(d)
}
