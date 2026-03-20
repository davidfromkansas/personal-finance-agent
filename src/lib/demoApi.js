/**
 * Maps API path + search params to demo data.
 * Called by apiFetch when isDemoMode() is true.
 */
import {
  DEMO_CONNECTIONS,
  DEMO_ACCOUNTS,
  DEMO_HOLDINGS,
  DEMO_RECURRING,
  DEMO_QUOTES,
  ACCT,
  getDemoTransactions,
  computeSpendingSummary,
  computeCashFlow,
  computeCashFlowTransactions,
  getDemoNetWorthHistory,
  getDemoPortfolioHistory,
  getDemoPortfolioSnapshot,
  getDemoTickerHistory,
} from './demoData.js'

function round2(n) { return Math.round(n * 100) / 100 }

export function getDemoResponse(pathname, search) {
  const p = new URLSearchParams(search)

  // ── Connections & accounts ────────────────────────────────────────────────
  if (pathname === '/api/plaid/connections') {
    return { connections: DEMO_CONNECTIONS }
  }
  if (pathname === '/api/plaid/accounts') {
    return { accounts: DEMO_ACCOUNTS }
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  if (pathname === '/api/plaid/transactions/accounts') {
    return {
      accounts: [
        { account_id: ACCT.CC.id,       name: ACCT.CC.name,       institution_name: 'Chase',    type: 'credit' },
        { account_id: ACCT.CHECKING.id,  name: ACCT.CHECKING.name, institution_name: 'Chase',    type: 'depository' },
      ],
    }
  }
  if (pathname === '/api/plaid/transactions/categories') {
    const cats = [...new Set(getDemoTransactions().map(t => t.personal_finance_category))]
    return { categories: cats.sort() }
  }
  if (pathname === '/api/plaid/transactions') {
    return filterTransactions(p)
  }

  // ── Spending summary ──────────────────────────────────────────────────────
  if (pathname === '/api/plaid/spending-summary') {
    const period = p.get('period') || 'month'
    return computeSpendingSummary(period)
  }

  // ── Cash flow ─────────────────────────────────────────────────────────────
  if (pathname === '/api/plaid/cash-flow-transactions') {
    const month = p.get('month') || '2026-02'
    const { inflows, outflows } = computeCashFlowTransactions(month)
    return { month, inflows, outflows }
  }
  if (pathname === '/api/plaid/cash-flow') {
    return { months: computeCashFlow() }
  }

  // ── Net worth ─────────────────────────────────────────────────────────────
  if (pathname === '/api/plaid/net-worth-history') {
    const range = p.get('range') || 'ALL'
    // Component expects { history: [{date, net_worth}] }
    const { points } = getDemoNetWorthHistory(range)
    return { range, history: points }
  }

  // ── Investments ───────────────────────────────────────────────────────────
  if (pathname === '/api/plaid/investments') {
    return { holdings: DEMO_HOLDINGS }
  }
  if (pathname === '/api/plaid/portfolio-history') {
    const range = p.get('range') || 'ALL'
    // Component expects { history: [{date, value}] }
    const { points } = getDemoPortfolioHistory(range)
    return { range, history: points }
  }
  if (pathname === '/api/plaid/portfolio-snapshot') {
    const date = p.get('date') || '2026-03-19'
    const snap = getDemoPortfolioSnapshot(date)
    const total = snap.holdings.reduce((s, h) => s + (h.value ?? 0), 0)
    return { ...snap, total }
  }
  if (pathname === '/api/plaid/ticker-history') {
    const tickers = (p.get('tickers') || '').split(',').filter(Boolean)
    const range = p.get('range') || '1Y'
    // Component expects { series: [{ticker, data: [{price, date}]}] }
    const { history } = getDemoTickerHistory(tickers, range)
    const series = tickers
      .filter(t => history[t])
      .map(t => ({
        ticker: t,
        data: history[t].map(pt => ({ date: pt.date, price: pt.close })),
      }))
    return { series }
  }
  if (pathname === '/api/plaid/quotes') {
    const tickers = (p.get('tickers') || '').split(',').filter(Boolean)
    // Component expects { quotes: [{ticker, price, change, changePct, week52Low, week52High}] }
    const quotes = tickers
      .filter(t => DEMO_QUOTES[t])
      .map(t => ({
        ticker: t,
        price: DEMO_QUOTES[t].price,
        change: DEMO_QUOTES[t].change,
        changePct: DEMO_QUOTES[t].changePercent,
        week52Low:  round2(DEMO_QUOTES[t].price * 0.72),
        week52High: round2(DEMO_QUOTES[t].price * 1.28),
      }))
    return { quotes }
  }

  // ── Recurring ─────────────────────────────────────────────────────────────
  if (pathname === '/api/plaid/recurring') {
    return { payments: DEMO_RECURRING }
  }

  // ── Mutations: return success for all write operations ───────────────────
  return { success: true, synced: 0, link_token: null }
}

// ─── Transaction filtering + pagination ─────────────────────────────────────
function filterTransactions(p) {
  let txns = getDemoTransactions()

  const afterDate  = p.get('after_date')
  const beforeDate = p.get('before_date')
  if (afterDate)  txns = txns.filter(t => t.date >= afterDate)
  if (beforeDate) txns = txns.filter(t => t.date <= beforeDate)

  const accountIds = p.getAll('account_ids').filter(Boolean)
  if (accountIds.length) txns = txns.filter(t => accountIds.includes(t.account_id))

  const categories = p.getAll('categories').filter(Boolean)
  if (categories.length) txns = txns.filter(t => categories.includes(t.personal_finance_category))

  const total = txns.length
  const limit  = parseInt(p.get('limit')  || '150', 10)
  const offset = parseInt(p.get('offset') || '0',   10)
  const page   = txns.slice(offset, offset + limit)

  return { transactions: page, total, has_more: offset + limit < total }
}
