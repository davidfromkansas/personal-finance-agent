/**
 * MCP server — exposes financial data as tools for Claude Desktop, ChatGPT, and the CLI.
 *
 * Mounted on Express at POST /mcp (requires authMiddleware — req.uid is set before this runs).
 * Uses StreamableHTTPServerTransport (stateful sessions via Mcp-Session-Id header).
 * Each session creates its own McpServer instance with tools pre-bound to the authenticated userId.
 *
 * Tools (all read-only, all scoped to req.uid):
 *   get_accounts              — balances for all linked accounts
 *   get_net_worth             — current net worth breakdown
 *   get_spending_summary      — spending by category for a period
 *   get_transactions          — recent transactions with optional filters
 *   get_cash_flow             — monthly inflows / outflows / net
 *   get_portfolio             — current investment holdings
 *   get_investment_transactions — trade history for an investment account
 *   ask_question              — natural language; delegates to the existing AI orchestrator
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
} from '../db.js'
import {
  getAgentSpendingSummary,
  getAgentTransactions,
  getAgentCashFlow,
} from '../agent/queries.js'
import { runChat } from '../agent/chat.js'

// ── Session store: sessionId → { transport, server, userId } ─────────────
const sessions = new Map()

// ── Tool factory — creates a McpServer with all tools bound to userId ─────

function createServer(userId) {
  const server = new McpServer({
    name: 'crumbs-financial',
    version: '1.0.0',
  })

  // ── get_accounts ─────────────────────────────────────────────────────────
  server.tool(
    'get_accounts',
    'Get balances for all linked bank, credit, loan, and investment accounts.',
    async () => {
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
    'Get current net worth: investment portfolio value plus all account balances (liabilities subtracted).',
    async () => {
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

  // ── get_spending_summary ──────────────────────────────────────────────────
  server.tool(
    'get_spending_summary',
    'Get spending broken down by category for a date range. Prefer this over get_transactions for totals and trends — it aggregates efficiently with no row limits. Supply after_date/before_date for any custom range (e.g. past 5 months).',
    {
      after_date:  z.string().describe('Start date YYYY-MM-DD (inclusive)'),
      before_date: z.string().describe('End date YYYY-MM-DD (inclusive)'),
      category:    z.string().optional().describe('Filter to a single Plaid category'),
    },
    async ({ after_date, before_date, category }) => {
      const data = await getAgentSpendingSummary(userId, after_date, before_date, category ?? null)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_transactions ──────────────────────────────────────────────────────
  server.tool(
    'get_transactions',
    'Get transactions for a date range. Always supply after_date and before_date to avoid unbounded queries. Use get_spending_summary for category totals instead of fetching all transactions.',
    {
      after_date:   z.string().describe('Start date YYYY-MM-DD (inclusive) — required'),
      before_date:  z.string().describe('End date YYYY-MM-DD (inclusive) — required'),
      category:     z.string().optional().describe('Plaid personal finance category to filter by'),
      spending_only: z.boolean().optional().describe('Exclude income and transfers (default false)'),
    },
    async ({ after_date, before_date, category, spending_only }) => {
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
    'Get monthly cash flow (inflows, outflows, net) for the past N months.',
    { months_back: z.number().int().min(1).max(24).optional().describe('Number of months (default 12)') },
    async ({ months_back }) => {
      const data = await getAgentCashFlow(userId, months_back ?? 12)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  // ── get_portfolio ─────────────────────────────────────────────────────────
  server.tool(
    'get_portfolio',
    'Get current investment holdings across all linked brokerage and retirement accounts.',
    async () => {
      const holdings = await getLatestHoldingsSnapshot(userId)
      return { content: [{ type: 'text', text: JSON.stringify({ holdings }, null, 2) }] }
    }
  )

  // ── get_investment_transactions ───────────────────────────────────────────
  server.tool(
    'get_investment_transactions',
    'Get trade history (buys, sells, dividends, etc.) for a specific investment account.',
    {
      account_id: z.string().describe('The investment account ID to fetch trades for'),
      limit:      z.number().int().min(1).max(500).optional().describe('Max results (default 200)'),
    },
    async ({ account_id, limit }) => {
      const txns = await getInvestmentTransactionsByAccount(userId, account_id, limit ?? 200)
      return { content: [{ type: 'text', text: JSON.stringify({ transactions: txns }, null, 2) }] }
    }
  )

  // ── ask_question ──────────────────────────────────────────────────────────
  server.tool(
    'ask_question',
    'Ask any natural language question about your finances. Delegates to the full AI orchestrator which can query spending, investments, and accounts.',
    { question: z.string().describe('The question to answer') },
    async ({ question }) => {
      const chunks = []
      const stream = runChat({ message: question, history: [], mode: 'Auto', userId, emit: () => {} })
      for await (const chunk of stream) {
        if (typeof chunk === 'string') chunks.push(chunk)
      }
      return { content: [{ type: 'text', text: chunks.join('') }] }
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
