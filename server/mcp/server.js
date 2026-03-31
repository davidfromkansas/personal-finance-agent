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
 *   get_recurring_transactions  — upcoming recurring bills and subscriptions
 *   get_portfolio               — current investment holdings
 *   get_investment_transactions — trade history for an investment account
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
  getPortfolioHistory,
  getPlaidItemsByUserId,
} from '../db.js'
import {
  getAgentSpendingSummary,
  getAgentTransactions,
  getAgentCashFlow,
} from '../agent/queries.js'
import { getPlaidClient } from '../lib/plaidClient.js'
import { runChat } from '../agent/chat.js'

// ── Session store: sessionId → { transport, server, userId } ─────────────
const sessions = new Map()

// ── Tool factory — creates a McpServer with all tools bound to userId ─────

const NO_ACCOUNTS_MSG = `No bank or investment accounts are connected yet.

To get started, visit https://abacus-money.com and sign in with the same Google account you used to authorize this connector. From there you can link your accounts via Plaid (takes about 2 minutes). Once linked, come back here and try again.`

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

If you haven't linked any accounts yet, visit https://abacus-money.com to get started.`,
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
      const history = await getPortfolioHistory(userId, since.toISOString().slice(0, 10))
      return { content: [{ type: 'text', text: JSON.stringify({ history }, null, 2) }] }
    }
  )

  // ── get_spending_summary ──────────────────────────────────────────────────
  server.tool(
    'get_spending_summary',
    `Return total spending broken down by category for any date range.
Prefer this over get_transactions for spending totals, category breakdowns, and trends — it aggregates at the DB level with no row limits.
Income, transfers, and inter-account credit card payments are automatically excluded.
Use this for: "how much did I spend on X?", "what are my biggest expense categories?", "compare spending this month vs last month" (call twice), "spending over the past N months".
Returns: { after_date, before_date, total, categories: [{ category, total, transaction_count }] }`,
    {
      after_date:  z.string().describe('Start date YYYY-MM-DD (inclusive)'),
      before_date: z.string().describe('End date YYYY-MM-DD (inclusive)'),
      category:    z.string().optional().describe('Filter to a single Plaid primary category (e.g. FOOD_AND_DRINK, TRAVEL, SHOPPING)'),
    },
    async ({ after_date, before_date, category }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentSpendingSummary(userId, after_date, before_date, category ?? null)
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
Each row: { month: "YYYY-MM", inflows, outflows, net }. Net = inflows − outflows (positive = saved money that month).
For category-level spending breakdown within a period, use get_spending_summary instead.`,
    {
      months_back: z.number().int().min(1).max(24).optional().describe('Number of months to return (default 12, max 24)'),
    },
    async ({ months_back }) => {
      if (!await hasAccounts(userId)) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
      const data = await getAgentCashFlow(userId, months_back ?? 12)
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
      const items = await getPlaidItemsByUserId(userId)
      if (items.length === 0) {
        return { content: [{ type: 'text', text: NO_ACCOUNTS_MSG }] }
      }
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
            console.warn('[mcp] recurring get failed for item:', err.message)
          }
        }
      }))

      allPayments.sort((a, b) => (a.predicted_next_date > b.predicted_next_date ? 1 : -1))
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
