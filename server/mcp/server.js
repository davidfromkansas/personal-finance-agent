/**
 * MCP server — exposes financial data as tools for Claude Desktop, ChatGPT, and the CLI.
 *
 * Mounted on Express at /mcp (requires authMiddleware — req.uid is set before this runs).
 * Uses StreamableHTTPServerTransport (stateful sessions via Mcp-Session-Id header).
 * Each session creates its own McpServer instance with tools pre-bound to the authenticated userId.
 *
 * Tools (all read-only, all scoped to req.uid):
 *   get_accounts                — balances for all linked accounts
 *   get_net_worth               — current net worth snapshot
 *   get_net_worth_history       — net worth (investment value) over time
 *   get_spending_summary        — spending by category for any date range
 *   get_transactions            — individual transactions for a date range
 *   get_cash_flow               — monthly inflows / outflows / net
 *   get_cash_flow_time_series   — inflows / outflows / net with day/week/month granularity
 *   get_cash_flow_node_transactions — drill into a breakdown category to see transactions
 *   compare_cash_flow           — period-over-period cash flow comparison with deltas
 *   get_recurring_transactions  — upcoming recurring bills and subscriptions
 *   get_portfolio               — current investment holdings
 *   get_investment_transactions — trade history for an investment account
 *   get_ticker_transactions    — trade history for a specific ticker across all accounts
 *   get_quotes                  — real-time quotes for any ticker symbols
 *   get_market_overview         — major index quotes + trending symbols
 *   get_stock_fundamentals      — key financial metrics and ratios
 *   get_analyst_ratings         — analyst recommendations + price targets
 *   get_company_news            — company-specific news articles
 *   get_market_news             — general market news headlines
 *   get_insider_activity        — insider transactions + sentiment
 *   get_earnings_data           — earnings calendar or company earnings
 *   get_company_profile         — company info (industry, sector, IPO, etc.)
 *   get_social_sentiment        — social media sentiment (Reddit, Twitter)
 *   ask_question                — delegates to the full AI orchestrator
 */
import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import {
  getLatestAccountBalances,
  getLatestInvestmentAccountBalances,
  getLatestPortfolioValue,
  getLatestHoldingsSnapshot,
  getInvestmentTransactionsByAccount,
  getInvestmentTransactionsByTicker,
  getPortfolioHistory,
  getPlaidItemsByUserId,
} from '../db.js'
import {
  getAgentSpendingSummary,
  getAgentTransactions,
  getAgentCashFlow,
  getAgentCashFlowBreakdown,
  getAgentCashFlowTimeSeries,
  getAgentCashFlowNodeTransactions,
  getAgentCashFlowComparison,
} from '../agent/queries.js'
import { getPlaidClient } from '../lib/plaidClient.js'
import { getRecurringTransactions } from '../lib/recurring.js'
import { runChat } from '../agent/chat.js'
import YahooFinance from 'yahoo-finance2'
import { finnhubGet, toDateStr } from '../lib/finnhub.js'
import { toDateStrET } from '../lib/dateUtils.js'

const yahooFinanceMcp = new YahooFinance({ suppressNotices: ['ripHistorical'] })

// Simple in-memory cache for MCP market data tools
const mcpCache = new Map()
function mcpCached(key, ttl, fn) {
  const entry = mcpCache.get(key)
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data)
  return fn().then(data => { mcpCache.set(key, { data, ts: Date.now() }); return data })
}

// ── Session store: sessionId → { transport, server, userId } ─────────────
const sessions = new Map()

// ── Tool factory — creates a McpServer with all tools bound to userId ─────

const NO_ACCOUNTS_MSG = `No bank or investment accounts are connected yet.

To get started, visit https://getabacus.xyz and sign in with the same Google account you used to authorize this connector. From there you can link your accounts via Plaid (takes about 2 minutes). Once linked, come back here and try again.`

async function hasAccounts(userId) {
  const items = await getPlaidItemsByUserId(userId)
  return items.length > 0
}

function createServer(userId) {
  const server = new McpServer({
    name: 'abacus-financial',
    version: '1.0.0',
  })

  // ── get_started ───────────────────────────────────────────────────────────
  server.tool(
    'get_started',
    `Return a guide explaining what financial data is available and example questions to ask.
Use this when the user asks "what can you do?", "help", "what tools do you have?", "where do I start?", or seems unsure how to begin.`,
    async () => {
      return {
        content: [{
          type: 'text',
          text: `# Abacus Financial Assistant

I have access to your linked bank, credit card, and investment accounts. Here's what you can ask me:

**Accounts & Net Worth**
- "What are my account balances?"
- "What is my net worth?"
- "How has my net worth changed over the past year?"

**Spending**
- "How much did I spend last month?"
- "What are my biggest spending categories?"
- "Show me my transactions at Uber this year"
- "Compare my spending this month vs last month"

**Cash Flow & Income**
- "What's my monthly cash flow?"
- "What is my savings rate?"
- "How much did I earn last month?"

**Investments**
- "What's in my portfolio?"
- "How are my investments performing?"
- "Show me my recent trades in my Fidelity account"

**Bills & Subscriptions**
- "What subscriptions am I paying for?"
- "What recurring bills are coming up?"

If you haven't linked any accounts yet, visit https://getabacus.xyz to get started.`,
        }],
      }
    }
  )

  // ── get_accounts ──────────────────────────────────────────────────────────
  server.tool(
    'get_accounts',
    `Return current balances for every linked account — checking, savings, credit cards, loans, and investment accounts.
Use this when the user asks about account balances, available credit, or wants a list of their accounts.
Each account includes: name, type, current balance, available balance (where applicable), and institution.
Credit and loan balances are positive numbers representing what is owed.`,
    async () => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const [regular, investment] = await Promise.all([
        getLatestAccountBalances(userId),
        getLatestInvestmentAccountBalances(userId),
      ])
      return {
        content: [{ type: 'text', text: JSON.stringify({ accounts: regular, investment_accounts: investment }, null, 2) }],
      }
    }
  )

  // ── get_net_worth ─────────────────────────────────────────────────────────
  server.tool(
    'get_net_worth',
    `Return the user's current net worth as a single number, plus a breakdown.
Net worth = investment portfolio value + liquid assets (checking/savings) − liabilities (credit cards, loans).
Use this for "what is my net worth?" or "how much am I worth?" questions.
For net worth over time or trends, use get_net_worth_history instead.`,
    async () => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const [investmentValue, accounts] = await Promise.all([
        getLatestPortfolioValue(userId),
        getLatestAccountBalances(userId),
      ])
      const liquid = accounts.reduce((sum, a) => {
        const val = a.current ?? 0
        const isLiability = a.type === 'credit' || a.type === 'loan'
        return sum + (isLiability ? -val : val)
      }, 0)
      const netWorth = (investmentValue ?? 0) + liquid
      return {
        content: [{ type: 'text', text: JSON.stringify({ net_worth: netWorth, investment_value: investmentValue, liquid_net_worth: liquid }, null, 2) }],
      }
    }
  )

  // ── get_net_worth_history ─────────────────────────────────────────────────
  server.tool(
    'get_net_worth_history',
    `Return daily investment portfolio value over time — useful for charting net worth trends, measuring growth, or comparing performance across periods.
Use this for questions like "how has my net worth changed?", "show me my portfolio growth over the past year", or "chart my wealth over time".
Returns an array of { date, value } points ordered by date ascending.
For the current snapshot only, use get_net_worth instead.`,
    {
      months_back: z.number().int().min(1).max(60).optional().describe('How many months of history to return (default 12, max 60)'),
    },
    async ({ months_back }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const since = new Date()
      since.setMonth(since.getMonth() - (months_back ?? 12))
      const history = await getPortfolioHistory(userId, toDateStrET(since))
      return { content: [{ type: 'text', text: JSON.stringify({ history }, null, 2) }] }
    }
  )

  // ── get_spending_summary ──────────────────────────────────────────────────
  server.tool(
    'get_spending_summary',
    `Return total spending broken down by category (or by account) for any date range.
Prefer this over get_transactions for spending totals, category breakdowns, and trends — it aggregates at the DB level with no row limits.
Income, transfers, and inter-account credit card payments are automatically excluded.
Use this for: "how much did I spend?", "how much did I spend on food?", "what are my biggest expense categories?", "compare spending this month vs last month" (call twice), "did I overspend?", "what did I blow money on?", "how much did I spend on my Amex vs Chase?".
For questions involving both income AND expenses (savings rate, net income, "where is my money going?"), use get_cash_flow_breakdown instead.
Returns: { after_date, before_date, total, categories: [{ category, total, transaction_count }] }
When group_by_account is true, returns: { after_date, before_date, total, accounts: [{ account, total, categories: [...] }] }`,
    {
      after_date:  z.string().describe('Start date YYYY-MM-DD (inclusive)'),
      before_date: z.string().describe('End date YYYY-MM-DD (inclusive)'),
      category:    z.string().optional().describe('Filter to a single Plaid primary category (e.g. FOOD_AND_DRINK, TRAVEL, SHOPPING)'),
      exclude_categories: z.array(z.string()).optional().describe('Plaid primary categories to exclude from results (e.g. ["RENT_AND_UTILITIES"] to exclude rent). Useful for seeing discretionary spending only.'),
      group_by_account: z.boolean().optional().describe('If true, break down spending by account with per-account category details. Use for "how much did each account spend?" or "Amex vs Chase spending".'),
    },
    async ({ after_date, before_date, category, exclude_categories, group_by_account }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentSpendingSummary(userId, after_date, before_date, category ?? null, exclude_categories ?? [], group_by_account ?? false)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_transactions ──────────────────────────────────────────────────────
  server.tool(
    'get_transactions',
    `Return individual transactions for a date range, with optional category and merchant filters.
Use this when the user wants to see specific transactions — e.g. "show me my Uber rides", "what did I spend at restaurants last week?", "list my transactions in March".
For totals and category breakdowns, use get_spending_summary instead (it's more efficient).
Results are ordered by date descending. No row limit — bounded by the date range provided.
Each transaction includes: merchant, amount (positive = expense, negative = income), date, category, account, pending status.`,
    {
      after_date:    z.string().describe('Start date YYYY-MM-DD (inclusive)'),
      before_date:   z.string().describe('End date YYYY-MM-DD (inclusive)'),
      category:      z.string().optional().describe('Plaid primary category to filter by (e.g. FOOD_AND_DRINK, TRAVEL)'),
      spending_only: z.boolean().optional().describe('If true, exclude income and transfers (default false)'),
    },
    async ({ after_date, before_date, category, spending_only }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const transactions = await getAgentTransactions(userId, {
        afterDate: after_date,
        beforeDate: before_date,
        category,
        spendingOnly: spending_only ?? false,
      })
      return { content: [{ type: 'text', text: JSON.stringify({ transactions }, null, 2) }] }
    }
  )

  // ── get_cash_flow ─────────────────────────────────────────────────────────
  server.tool(
    'get_cash_flow',
    `Return monthly cash flow — total inflows (income), outflows (spending), and net for each month.
Use this for questions about income vs expenses over time, savings rate, or month-over-month cash flow trends.
Also use when the user asks things like: "is it getting better or worse?", "how has my spending changed?", "am I saving more than before?", "show me my income vs spending over time".
Each row: { month: "YYYY-MM", inflows, outflows, net }. Net = inflows − outflows (positive = saved money that month).
For category-level spending breakdown within a period, use get_cash_flow_breakdown instead.`,
    {
      months_back: z.number().int().min(1).max(24).optional().describe('Number of months to return (default 12, max 24)'),
      account_ids: z.array(z.string()).optional().describe('Optional: filter to specific account IDs (get from get_accounts)'),
    },
    async ({ months_back, account_ids }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentCashFlow(userId, months_back ?? 12, account_ids ?? null)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_cash_flow_time_series ────────────────────────────────────────────
  server.tool(
    'get_cash_flow_time_series',
    `Return inflows, outflows, and net for a custom date range with day, week, or month granularity.
Use this when the user specifies exact dates ("how was my cash flow in March?"), wants daily or weekly detail, or needs finer resolution than monthly.
Also use for: "show me daily spending last week", "weekly cash flow for Q1", "how did March compare day by day?".
Prefer over get_cash_flow when exact dates or non-monthly granularity are involved.
Returns: { start_date, end_date, granularity, buckets: [{ bucket, inflows, outflows, net }] }`,
    {
      start_date: z.string().describe('Start date YYYY-MM-DD (inclusive)'),
      end_date: z.string().describe('End date YYYY-MM-DD (inclusive)'),
      granularity: z.enum(['day', 'week', 'month']).optional().describe('How to bucket results: day (for ranges ≤14 days), week (≤90 days), month (longer). Default: month'),
      account_ids: z.array(z.string()).optional().describe('Optional: filter to specific account IDs (get from get_accounts)'),
    },
    async ({ start_date, end_date, granularity, account_ids }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentCashFlowTimeSeries(userId, start_date, end_date, granularity ?? 'month', account_ids ?? null)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_cash_flow_breakdown ──────────────────────────────────────────────
  server.tool(
    'get_cash_flow_breakdown',
    `Return cash flow broken down by category, group, or merchant for a time period.
Shows both income sources and expense categories with totals, net, and savings rate.
Use this for questions like: "where is my money going?", "what are my biggest expenses?", "break down my income sources", "what's my savings rate?", "am I saving enough?", "am I living within my means?", "what's eating my paycheck?", "how much did I make?", "what am I paying for?", "how much came in vs went out?".
This is the most versatile cash flow tool — prefer it when the question involves both income and expenses.
For month-over-month cash flow trends over time, use get_cash_flow instead.`,
    {
      period: z.enum(['week', 'month', 'quarter', 'year']).optional().describe('Time period: week (7 days), month (30 days), quarter (3 months), year (12 months). Default: month. Ignored if start_date and end_date are provided.'),
      breakdown: z.enum(['category', 'group', 'merchant']).optional().describe('How to group: category (Plaid categories), group (coarser grouping), merchant (by merchant name). Default: category'),
      account_ids: z.array(z.string()).optional().describe('Optional: filter to specific account IDs (get from get_accounts)'),
      start_date: z.string().optional().describe('Optional: custom start date YYYY-MM-DD (inclusive). Use with end_date instead of period.'),
      end_date: z.string().optional().describe('Optional: custom end date YYYY-MM-DD (inclusive). Use with start_date instead of period.'),
      exclude_categories: z.array(z.string()).optional().describe('Plaid primary categories to exclude (e.g. ["RENT_AND_UTILITIES"]). Useful for analyzing discretionary spending without rent skewing the picture.'),
    },
    async ({ period, breakdown, account_ids, start_date, end_date, exclude_categories }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const customRange = start_date && end_date ? { startDate: start_date, endDate: end_date } : null
      const data = await getAgentCashFlowBreakdown(userId, period ?? 'month', breakdown ?? 'category', account_ids ?? null, customRange, exclude_categories ?? [])
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_cash_flow_node_transactions ────────────────────────────────────────
  server.tool(
    'get_cash_flow_node_transactions',
    `Drill into a specific category, group, or merchant from a cash flow breakdown to see the individual transactions behind it.
Use after get_cash_flow_breakdown when the user asks about a specific line item — e.g. "what's in my Food & Drink spending?", "show me my rent payments", "what makes up that $800 in shopping?", "break down my income sources".
Returns the matching transactions with merchant, amount, date, account, and category.`,
    {
      period: z.enum(['week', 'month', 'quarter', 'year']).describe('Same period used in the breakdown query'),
      flow_type: z.enum(['income', 'expense']).describe('Whether to drill into an income source or expense category'),
      category_key: z.string().describe('The category/group/merchant name from get_cash_flow_breakdown results (e.g. "FOOD_AND_DRINK", "Housing", "Uber")'),
      breakdown: z.enum(['category', 'group', 'merchant']).optional().describe('Must match the breakdown used in get_cash_flow_breakdown (default: category)'),
    },
    async ({ period, flow_type, category_key, breakdown }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentCashFlowNodeTransactions(userId, period, flow_type, category_key, breakdown ?? 'category')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── compare_cash_flow ────────────────────────────────────────────────────
  server.tool(
    'compare_cash_flow',
    `Compare cash flow between two date ranges — shows income, expenses, net, savings rate, and per-category changes with deltas and percentages.
Use when the user asks "how does this month compare to last month?", "am I spending more than usual?", "did I improve?", "is it getting better?", or any period-vs-period question.
Returns headline numbers for both periods, the delta, and category_changes sorted by largest absolute change — lead your response with the top movers and tell a story about what changed.`,
    {
      current_start_date: z.string().describe('Start of the current/recent period (YYYY-MM-DD)'),
      current_end_date: z.string().describe('End of the current/recent period (YYYY-MM-DD)'),
      previous_start_date: z.string().describe('Start of the comparison period (YYYY-MM-DD)'),
      previous_end_date: z.string().describe('End of the comparison period (YYYY-MM-DD)'),
      breakdown: z.enum(['category', 'group', 'merchant']).optional().describe('How to group category changes (default: group)'),
      exclude_categories: z.array(z.string()).optional().describe('Plaid primary categories to exclude (e.g. ["RENT_AND_UTILITIES"]). Applied to both periods for fair comparison.'),
    },
    async ({ current_start_date, current_end_date, previous_start_date, previous_end_date, breakdown, exclude_categories }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentCashFlowComparison(
        userId,
        { startDate: current_start_date, endDate: current_end_date },
        { startDate: previous_start_date, endDate: previous_end_date },
        breakdown ?? 'group',
        exclude_categories ?? []
      )
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_recurring_transactions ────────────────────────────────────────────
  server.tool(
    'get_recurring_transactions',
    `Return the user's recurring bills and subscriptions — detected by Plaid from transaction history.
Use this for questions like "what subscriptions do I have?", "what bills are coming up?", "what are my recurring expenses?", "am I being charged for anything I forgot about?".
Each item includes: merchant name, average amount, frequency (WEEKLY/MONTHLY/ANNUALLY), predicted next payment date, and category.
Results come directly from Plaid's recurring detection — may not include brand-new subscriptions.`,
    async () => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const allPayments = await getRecurringTransactions(userId)
      return { content: [{ type: 'text', text: JSON.stringify({ recurring_transactions: allPayments }, null, 2) }] }
    }
  )

  // ── get_portfolio ─────────────────────────────────────────────────────────
  server.tool(
    'get_portfolio',
    `Return current investment holdings across all linked brokerage, IRA, and 401k accounts.
Use this for questions like "what stocks do I own?", "what is my portfolio?", "how is my portfolio allocated?", "what is my largest position?".
Each holding includes: ticker, security name, quantity, current price, total value, cost basis (where available), and account.
For portfolio value over time, use get_net_worth_history. For trade history, use get_investment_transactions.`,
    async () => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const holdings = await getLatestHoldingsSnapshot(userId)
      return { content: [{ type: 'text', text: JSON.stringify({ holdings }, null, 2) }] }
    }
  )

  // ── get_investment_transactions ───────────────────────────────────────────
  server.tool(
    'get_investment_transactions',
    `Return trade history for a specific investment account — buys, sells, dividends, transfers, and fees.
Use this when the user asks about specific trades, dividend income, or activity in a brokerage account.
Requires an account_id — call get_accounts first to get investment account IDs.
Each transaction includes: date, type (buy/sell/dividend/etc.), security name, ticker, quantity, price, and amount.`,
    {
      account_id: z.string().describe('Investment account ID — get this from get_accounts'),
      limit:      z.number().int().min(1).max(500).optional().describe('Max results (default 200)'),
    },
    async ({ account_id, limit }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const txns = await getInvestmentTransactionsByAccount(userId, account_id, limit ?? 200)
      return { content: [{ type: 'text', text: JSON.stringify({ transactions: txns }, null, 2) }] }
    }
  )

  // ── get_ticker_transactions ────────────────────────────────────────────────
  server.tool(
    'get_ticker_transactions',
    `Return trade history for a specific ticker across all investment accounts — buys, sells, dividends, transfers, and fees.
Use this when the user asks about a specific stock or ETF's purchase history, e.g. "when did I buy VOO?", "show me my PLTR trades".
Each transaction includes: date, type, ticker, security name, quantity, price, amount, account name, and institution.`,
    {
      ticker: z.string().describe('Ticker symbol, e.g. "VOO", "PLTR", "AAPL"'),
      limit:  z.number().int().min(1).max(500).optional().describe('Max results (default 200)'),
    },
    async ({ ticker, limit }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const txns = await getInvestmentTransactionsByTicker(userId, ticker.toUpperCase(), limit ?? 200)
      return { content: [{ type: 'text', text: JSON.stringify({ transactions: txns }, null, 2) }] }
    }
  )

  // ── get_quotes ────────────────────────────────────────────────────────────
  server.tool(
    'get_quotes',
    `Return real-time quotes for one or more stock tickers.
Use this when the user asks about current prices — e.g. "what's Apple trading at?", "TSLA price", "how are my holdings doing right now?", "what's the price of VOO?".
Returns: price, previous close, change, change %, market state, 52-week range, market cap, P/E ratio, EPS, and next earnings date.
No linked accounts required — this uses public market data.`,
    {
      tickers: z.array(z.string()).describe('List of ticker symbols (e.g. ["AAPL", "TSLA", "VOO"])'),
    },
    async ({ tickers }) => {
      const results = await Promise.allSettled(
        tickers.map(ticker =>
          yahooFinanceMcp.quote(ticker, {}, { validateResult: false }).then(q => ({
            ticker,
            name: q.shortName || q.longName || ticker,
            price: q.regularMarketPrice ?? null,
            prevClose: q.regularMarketPreviousClose ?? null,
            change: q.regularMarketChange ?? null,
            changePct: q.regularMarketChangePercent ?? null,
            marketState: q.marketState ?? null,
            week52Low: q.fiftyTwoWeekLow ?? null,
            week52High: q.fiftyTwoWeekHigh ?? null,
            marketCap: q.marketCap ?? null,
            peRatio: q.trailingPE ?? null,
            eps: q.epsTrailingTwelveMonths ?? null,
            earningsDate: q.earningsTimestamp ? toDateStrET(new Date(q.earningsTimestamp)) : (q.earningsTimestampStart ? toDateStrET(new Date(q.earningsTimestampStart)) : null),
          }))
        )
      )
      const quotes = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
      return { content: [{ type: 'text', text: JSON.stringify({ quotes }, null, 2) }] }
    }
  )

  // ── Market Research Tools (no linked accounts required) ─────────────────

  // ── get_market_overview ──────────────────────────────────────────────────
  server.tool(
    'get_market_overview',
    `Return current quotes for major US indices (SPY, QQQ, DIA, IWM) plus currently trending symbols.
Use for "how is the market doing?", "market overview", "what's trending?" questions.
No linked accounts required — this uses public market data.`,
    async () => {
      const indices = await mcpCached('mcp_indices', 60_000, () =>
        Promise.allSettled(['SPY', 'QQQ', 'DIA', 'IWM'].map(s =>
          yahooFinanceMcp.quote(s, {}, { validateResult: false })
        ))
      )
      const result = indices
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => {
          const q = r.value
          return { symbol: q.symbol, name: q.shortName || q.symbol, price: q.regularMarketPrice, change: q.regularMarketChange, changePct: q.regularMarketChangePercent, marketState: q.marketState }
        })
      return { content: [{ type: 'text', text: JSON.stringify({ indices: result }, null, 2) }] }
    }
  )

  // ── get_stock_fundamentals (MCP) ────────────────────────────────────────
  server.tool(
    'get_stock_fundamentals',
    `Return key financial metrics, ratios, and estimates for a company — P/E, PEG, margins, growth, debt, analyst targets, EPS estimates.
Use for deep-dive stock analysis questions. No linked accounts required.`,
    {
      symbol: z.string().describe('Ticker symbol (e.g. "AAPL")'),
    },
    async ({ symbol }) => {
      const sym = symbol.toUpperCase()
      const [ySummary, fhMetric] = await Promise.all([
        mcpCached(`mcp_fundamentals_${sym}`, 300_000, () =>
          yahooFinanceMcp.quoteSummary(sym, {
            modules: ['financialData', 'defaultKeyStatistics', 'earningsTrend', 'price'],
          }, { validateResult: false }).catch(() => null)
        ),
        finnhubGet('/stock/metric', { symbol: sym, metric: 'all' }, 300_000),
      ])
      const fd = ySummary?.financialData ?? {}
      const ks = ySummary?.defaultKeyStatistics ?? {}
      const p = ySummary?.price ?? {}
      const fhM = fhMetric?.metric ?? {}
      const result = {
        symbol: sym, currentPrice: p.regularMarketPrice, marketCap: p.marketCap, currency: p.currency,
        trailingPE: ks.trailingPE ?? fhM.peBasicExclExtraTTM, forwardPE: ks.forwardPE, pegRatio: ks.pegRatio,
        priceToBook: ks.priceToBook ?? fhM.pbAnnual, beta: ks.beta ?? fhM.beta,
        fiftyTwoWeekHigh: ks.fiftyTwoWeekHigh, fiftyTwoWeekLow: ks.fiftyTwoWeekLow,
        revenueGrowth: fd.revenueGrowth, earningsGrowth: fd.earningsGrowth,
        profitMargins: fd.profitMargins, returnOnEquity: fd.returnOnEquity,
        debtToEquity: fd.debtToEquity, currentRatio: fd.currentRatio,
        freeCashflow: fd.freeCashflow, operatingCashflow: fd.operatingCashflow,
        targetMeanPrice: fd.targetMeanPrice, targetHighPrice: fd.targetHighPrice, targetLowPrice: fd.targetLowPrice,
        numberOfAnalystOpinions: fd.numberOfAnalystOpinions,
        dividendYieldTTM: fhM.dividendYieldIndicatedAnnual,
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ── get_analyst_ratings (MCP) ───────────────────────────────────────────
  server.tool(
    'get_analyst_ratings',
    `Return analyst recommendation trends and price targets for a stock.
Use for "what do analysts think about X?", "price targets for X" questions. No linked accounts required.`,
    {
      symbol: z.string().describe('Ticker symbol (e.g. "AAPL")'),
    },
    async ({ symbol }) => {
      const sym = symbol.toUpperCase()
      const [recs, targets] = await Promise.all([
        finnhubGet('/stock/recommendation', { symbol: sym }, 600_000),
        finnhubGet('/stock/price-target', { symbol: sym }, 600_000),
      ])
      const result = {
        recommendations: Array.isArray(recs) ? recs.slice(0, 6) : recs,
        priceTarget: targets?.error ? targets : {
          targetHigh: targets.targetHigh, targetLow: targets.targetLow,
          targetMean: targets.targetMean, targetMedian: targets.targetMedian,
        },
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ── get_company_news (MCP) ──────────────────────────────────────────────
  server.tool(
    'get_company_news',
    `Return recent news articles about a specific company from Finnhub.
Use for "any news about X?", "what's happening with X?" questions. No linked accounts required.`,
    {
      symbol: z.string().describe('Ticker symbol (e.g. "AAPL")'),
      days_back: z.number().int().min(1).max(90).optional().describe('Number of days to look back (default 45)'),
    },
    async ({ symbol, days_back }) => {
      const sym = symbol.toUpperCase()
      const to = toDateStr(new Date())
      const from = toDateStr(new Date(Date.now() - (days_back || 45) * 24 * 60 * 60 * 1000))
      const data = await finnhubGet('/company-news', { symbol: sym, from, to }, 180_000)
      if (data?.error) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      const articles = (Array.isArray(data) ? data : []).slice(0, 15).map(a => ({
        headline: a.headline, summary: a.summary, source: a.source, url: a.url,
        datetime: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
      }))
      return { content: [{ type: 'text', text: JSON.stringify({ articles }, null, 2) }] }
    }
  )

  // ── get_market_news (MCP) ───────────────────────────────────────────────
  server.tool(
    'get_market_news',
    `Return general financial market news headlines from Finnhub.
Use for "what's happening in the market?", "any big news today?" questions. No linked accounts required.`,
    async () => {
      const data = await finnhubGet('/news', { category: 'general' }, 180_000)
      if (data?.error) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      const articles = (Array.isArray(data) ? data : []).slice(0, 15).map(a => ({
        headline: a.headline, summary: a.summary, source: a.source, url: a.url,
        datetime: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
      }))
      return { content: [{ type: 'text', text: JSON.stringify({ articles }, null, 2) }] }
    }
  )

  // ── get_insider_activity (MCP) ──────────────────────────────────────────
  server.tool(
    'get_insider_activity',
    `Return recent insider transactions and insider sentiment for a stock.
Use for "any insider buying/selling?", "insider activity on X" questions. No linked accounts required.`,
    {
      symbol: z.string().describe('Ticker symbol (e.g. "AAPL")'),
    },
    async ({ symbol }) => {
      const sym = symbol.toUpperCase()
      const [txns, sentiment] = await Promise.all([
        finnhubGet('/stock/insider-transactions', { symbol: sym }, 600_000),
        finnhubGet('/stock/insider-sentiment', { symbol: sym, from: '2020-01-01', to: toDateStr(new Date()) }, 600_000),
      ])
      const result = {
        transactions: (txns?.data ?? txns ?? []).slice?.(0, 20) ?? txns,
        sentiment: sentiment?.error ? sentiment : (sentiment?.data ?? sentiment),
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ── get_earnings_data (MCP) ─────────────────────────────────────────────
  server.tool(
    'get_earnings_data',
    `Return earnings calendar (upcoming earnings) or company-specific earnings history.
If symbol is provided: returns earnings surprises for that company.
If symbol is omitted: returns upcoming earnings calendar for the next 7 days.
No linked accounts required.`,
    {
      symbol: z.string().optional().describe('Ticker symbol. Omit for upcoming earnings calendar.'),
    },
    async ({ symbol }) => {
      if (symbol) {
        const data = await finnhubGet('/stock/earnings', { symbol: symbol.toUpperCase() }, 300_000)
        if (data?.error) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
        return { content: [{ type: 'text', text: JSON.stringify({ earnings: Array.isArray(data) ? data.slice(0, 12) : data }, null, 2) }] }
      }
      const from = toDateStr(new Date())
      const to = toDateStr(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      const data = await finnhubGet('/calendar/earnings', { from, to }, 300_000)
      if (data?.error) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      return { content: [{ type: 'text', text: JSON.stringify({ earnings: (data?.earningsCalendar ?? []).slice(0, 30) }, null, 2) }] }
    }
  )

  // ── get_company_profile (MCP) ───────────────────────────────────────────
  server.tool(
    'get_company_profile',
    `Return company profile: name, industry, sector, market cap, IPO date, website.
Use for "tell me about X", "what does X do?" questions. No linked accounts required.`,
    {
      symbol: z.string().describe('Ticker symbol (e.g. "AAPL")'),
    },
    async ({ symbol }) => {
      const data = await finnhubGet('/stock/profile2', { symbol: symbol.toUpperCase() }, 300_000)
      if (data?.error) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      const result = {
        name: data.name, ticker: data.ticker, exchange: data.exchange,
        industry: data.finnhubIndustry, country: data.country,
        marketCap: data.marketCapitalization, shareOutstanding: data.shareOutstanding,
        ipo: data.ipo, weburl: data.weburl, logo: data.logo,
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ── get_social_sentiment (MCP) ──────────────────────────────────────────
  server.tool(
    'get_social_sentiment',
    `Return social media sentiment data for a stock from Reddit and Twitter.
Use for "what are people saying about X?" questions. No linked accounts required.
Note: This may require a premium Finnhub plan.`,
    {
      symbol: z.string().describe('Ticker symbol (e.g. "AAPL")'),
    },
    async ({ symbol }) => {
      const from = toDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      const to = toDateStr(new Date())
      const data = await finnhubGet('/stock/social-sentiment', { symbol: symbol.toUpperCase(), from, to }, 600_000)
      if (data?.error) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      return { content: [{ type: 'text', text: JSON.stringify({ reddit: (data.reddit ?? []).slice(0, 10), twitter: (data.twitter ?? []).slice(0, 10) }, null, 2) }] }
    }
  )

  // ── ask_question ──────────────────────────────────────────────────────────
  server.tool(
    'ask_question',
    `Delegate a complex financial question to the full AI orchestrator — a multi-step agent with access to all data sources.
Use this as a fallback when the direct tools above aren't sufficient — e.g. for questions that require combining multiple data sources, complex reasoning, or narrative answers.
For simple lookups (balances, spending totals, transactions), prefer the direct tools above — they are faster and more reliable.
Pass conversation_history to give the orchestrator context from the current conversation.`,
    {
      question: z.string().describe('The financial question to answer'),
      conversation_history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional().describe('Recent conversation turns for context (last 3-4 messages recommended)'),
    },
    async ({ question, conversation_history }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const history = (conversation_history ?? []).map(m => ({
        role: m.role,
        content: m.content,
      }))
      // Collect per-agent activity and stream progress notifications to the MCP client
      const agentActivities = []
      const pendingAgents = new Map()
      const emit = ({ type, agent, question: q, toolCount, duration }) => {
        if (type === 'agent_start') {
          pendingAgents.set(agent, { question: q })
          server.sendLoggingMessage({
            level: 'info',
            logger: 'abacus',
            data: { type: 'agent_start', agent, question: q },
          }).catch(() => {})
        } else if (type === 'agent_done') {
          const pending = pendingAgents.get(agent)
          agentActivities.push({ agent, question: pending?.question ?? '', toolCount, duration })
          pendingAgents.delete(agent)
          server.sendLoggingMessage({
            level: 'info',
            logger: 'abacus',
            data: { type: 'agent_done', agent, toolCount, duration },
          }).catch(() => {})
        }
      }
      const chunks = []
      const stream = runChat({ message: question, history, mode: 'Auto', userId, emit })
      for await (const chunk of stream) {
        if (typeof chunk === 'string') chunks.push(chunk)
      }
      // Prepend agent activity markers the CLI can parse and display
      // Format: [ABACUS_AGENT:agentName|toolCount|durationMs|questionSnippet]
      const prefix = agentActivities.length
        ? agentActivities.map(a => {
            const q = (a.question ?? '').replace(/[\|\]]/g, ' ').slice(0, 80)
            return `[ABACUS_AGENT:${a.agent}|${a.toolCount}|${a.duration}|${q}]`
          }).join('') + '\n'
        : ''
      return { content: [{ type: 'text', text: prefix + chunks.join('') }] }
    }
  )

  return server
}

// ── Express handler ───────────────────────────────────────────────────────

export async function mcpHandler(req, res) {
  try {
    const sessionId = req.headers['mcp-session-id']

    // Reuse existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)
      if (session.userId !== req.uid) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      await session.transport.handleRequest(req, res, req.body)
      return
    }

    // New session — create transport + server bound to this user
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    })
    const server = createServer(req.uid)

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
      server.close().catch(() => {})
    }

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)

    if (transport.sessionId) {
      sessions.set(transport.sessionId, { transport, server, userId: req.uid })
    }
  } catch (err) {
    console.error('[mcp] handler error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'MCP server error' })
  }
}
