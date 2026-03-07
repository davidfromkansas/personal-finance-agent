/**
 * backfillInvestments(userId)
 *
 * One-time historical backfill of portfolio values. Reconstructs daily portfolio value
 * going back as far as Plaid's investment transaction history allows, using:
 *   - 1st party data: current holdings (quantities) + Plaid transaction history (buys/sells/vests)
 *   - 3rd party prices: adjusted closing prices from yahoo-finance2
 *
 * Formula: Portfolio Value(t) = Σ [ Quantity_i(t) × AdjustedPrice_i(t) ]
 *
 * Writes to portfolio_snapshots with source='backfill'.
 * ON CONFLICT DO NOTHING — never overwrites live snapshots.
 *
 * Safe to call multiple times — idempotent.
 *
 * ---
 * REPLACEABILITY NOTE: All price lookups go through fetchHistoricalPrices() below.
 * To swap yahoo-finance2 for Polygon.io, Alpha Vantage, or any other source,
 * replace only that function — no other changes needed.
 * ---
 */
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] })
import { getPlaidClient } from '../lib/plaidClient.js'
import {
  getPlaidItemsByUserId,
  getLatestHoldingsSnapshot,
  insertBackfillPortfolioSnapshot,
} from '../db.js'

const SKIP_CODES = [
  'PRODUCTS_NOT_SUPPORTED',
  'NO_INVESTMENT_ACCOUNTS',
  'CONSENT_NOT_GRANTED',
  'ADDITIONAL_CONSENT_REQUIRED',
  'ITEM_LOGIN_REQUIRED',
]

// How far back to request from Plaid
const BACKFILL_YEARS = 5

/**
 * Fetch adjusted closing prices for a ticker over a date range.
 * Returns Map<dateStr, adjClose> e.g. { '2024-01-15': 142.50 }
 *
 * REPLACE THIS FUNCTION to swap the market data source.
 */
async function fetchHistoricalPrices(ticker, startDate, endDate) {
  try {
    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    }, { validateResult: false })

    const priceMap = new Map()
    for (const row of result?.quotes ?? []) {
      if (row.adjclose != null) {
        const dateStr = new Date(row.date).toISOString().slice(0, 10)
        priceMap.set(dateStr, row.adjclose)
      }
    }
    return priceMap
  } catch (err) {
    console.warn(`[backfill] Price fetch failed for ${ticker}:`, err.message)
    return new Map()
  }
}

function dateRange(startStr, endStr) {
  const dates = []
  const d = new Date(startStr + 'T00:00:00Z')
  const end = new Date(endStr + 'T00:00:00Z')
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dates
}

function subtractYears(dateStr, years) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function yesterday() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function backfillInvestments(userId) {
  console.log(`[backfill] Starting for user ${userId}`)

  const items = await getPlaidItemsByUserId(userId)
  const plaidClient = getPlaidClient()

  const endDate = yesterday()
  const startDate = subtractYears(endDate, BACKFILL_YEARS)

  // Collect all investment transactions across all items
  // key: security_id, value: array of { date, quantity, type }
  const txnsBySecurityId = {}

  for (const item of items) {
    try {
      const txnRes = await plaidClient.investmentsTransactionsGet({
        access_token: item.access_token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500 },
      })

      // Plaid paginates; fetch all pages
      let allTxns = txnRes.data.investment_transactions ?? []
      const total = txnRes.data.total_investment_transactions ?? allTxns.length
      let offset = allTxns.length
      while (offset < total) {
        const page = await plaidClient.investmentsTransactionsGet({
          access_token: item.access_token,
          start_date: startDate,
          end_date: endDate,
          options: { count: 500, offset },
        })
        allTxns = allTxns.concat(page.data.investment_transactions ?? [])
        offset += page.data.investment_transactions?.length ?? 0
        if (!page.data.investment_transactions?.length) break
      }

      for (const t of allTxns) {
        if (!t.security_id) continue
        if (!txnsBySecurityId[t.security_id]) txnsBySecurityId[t.security_id] = []
        txnsBySecurityId[t.security_id].push({
          date: t.date,
          quantity: t.quantity ?? 0,
          type: t.type,
          subtype: t.subtype,
        })
      }
    } catch (err) {
      const code = err.response?.data?.error_code
      if (SKIP_CODES.includes(code)) continue
      console.error(`[backfill] investmentsTransactionsGet failed for item ${item.item_id}:`, err.response?.data ?? err.message)
    }
  }

  // Get current holdings as the starting point for quantity reconstruction
  const currentHoldings = await getLatestHoldingsSnapshot(userId)
  if (currentHoldings.length === 0) {
    console.log('[backfill] No current holdings found — skipping backfill')
    return
  }

  // Build security metadata map: security_id -> { ticker, currentQty, currentPrice }
  // Also sum up holdings with no ticker — we can't reconstruct their history, so we carry
  // them at current value as a constant offset across all backfill days.
  const securities = {}
  let nullTickerConstant = 0
  for (const h of currentHoldings) {
    if (!h.security_id) continue
    if (!h.ticker) {
      nullTickerConstant += parseFloat(h.value) || 0
      continue
    }
    if (!securities[h.security_id]) {
      securities[h.security_id] = {
        ticker: h.ticker,
        currentQty: parseFloat(h.quantity) || 0,
        currentPrice: h.price != null ? parseFloat(h.price) : null,
      }
    }
  }
  if (nullTickerConstant > 0) {
    console.log(`[backfill] Null-ticker holdings constant: $${nullTickerConstant.toFixed(2)} (carried at current value across all days)`)
  }

  const allDates = dateRange(startDate, endDate)

  // For each security, reconstruct daily quantities by walking backwards from today
  // Then fetch prices and compute per-security daily values
  // dailyTotals: Map<dateStr, totalValue>
  const dailyTotals = new Map()

  for (const [secId, sec] of Object.entries(securities)) {
    const txns = (txnsBySecurityId[secId] ?? [])
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first for backwards walk

    // Fetch historical prices for this ticker
    let prices = await fetchHistoricalPrices(sec.ticker, startDate, endDate)
    if (prices.size === 0) {
      if (sec.currentPrice != null) {
        // No historical data (common for money market funds, stable-NAV instruments).
        // Use the current price as a constant across all dates — accurate for $1/share
        // funds (VMFXX, SPAXX, etc.) and a reasonable approximation for others.
        console.log(`[backfill] No price data for ${sec.ticker} — using constant current price $${sec.currentPrice}`)
        prices = new Map(allDates.map((d) => [d, sec.currentPrice]))
      } else {
        console.log(`[backfill] No price data for ${sec.ticker} — skipping`)
        continue
      }
    }

    // Reconstruct quantity on each day by walking backwards
    let qty = sec.currentQty
    let txnIdx = 0
    const sortedDatesDesc = [...allDates].reverse() // today → oldest

    for (const dateStr of sortedDatesDesc) {
      // Apply transactions on this date (walking backwards: undo them)
      while (txnIdx < txns.length && txns[txnIdx].date === dateStr) {
        const t = txns[txnIdx]
        const q = parseFloat(t.quantity) || 0
        const type = t.type?.toLowerCase()
        const subtype = t.subtype?.toLowerCase()

        if (type === 'buy' || subtype === 'buy' || subtype === 'vest') {
          qty -= q   // going back in time: before the buy, had fewer
        } else if (type === 'sell' || subtype === 'sell') {
          qty += q   // going back in time: before the sell, had more
        } else if (subtype === 'dividend_reinvestment') {
          qty -= q
        }
        txnIdx++
      }

      if (qty <= 0) continue
      const price = prices.get(dateStr)
      if (price == null) continue

      const value = qty * price
      dailyTotals.set(dateStr, (dailyTotals.get(dateStr) ?? 0) + value)
    }
  }

  if (dailyTotals.size === 0) {
    console.log('[backfill] No data points reconstructed — check holdings and price coverage')
    return
  }

  // Write backfill snapshots (ON CONFLICT DO NOTHING — never overwrites live)
  // Add null-ticker constant to every day so those holdings don't create a cliff at the live boundary.
  let written = 0
  for (const [dateStr, totalValue] of dailyTotals) {
    const dayTotal = totalValue + nullTickerConstant
    if (dayTotal > 0) {
      await insertBackfillPortfolioSnapshot(userId, dateStr, Math.round(dayTotal * 100) / 100)
      written++
    }
  }

  console.log(`[backfill] Done for user ${userId}: ${written} days written`)
}
