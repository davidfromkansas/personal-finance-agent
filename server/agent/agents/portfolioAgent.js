/**
 * Portfolio agent — analyzes investment portfolio, holdings, and performance.
 * Registers itself on import via registerAgent().
 */
import Anthropic from '@anthropic-ai/sdk'
import { registerAgent } from '../registry.js'
import { extractAndEmitVisualizations, hasChartIntent } from '../renderChart.js'
import {
  getPlaidItemsByUserId,
  hasHistoricalPortfolioData,
  getLatestPortfolioValue,
  getPortfolioHistory,
  getPortfolioAccountHistory,
  getHoldingsSnapshotForDate,
  getHoldingsHistory,
  getInvestmentAccounts,
} from '../../db.js'

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MAX_ITERATIONS = 8

const SYSTEM_PROMPT = `You are the portfolio analyst for Abacus. You answer questions about the user's investment portfolio, holdings, and performance using your tools.

## Visualizations — read this first
When the user asks for a chart, graph, comparison, or visual breakdown: fetch the data with your tools, then output a visualization block. This is how charts work in this app — you output structured JSON and the UI renders it. You can always do this.

Format:
\`\`\`visualization
{"display_type":"line","title":"...","data":[...],"x_key":"...","y_keys":["..."],"y_label":"..."}
\`\`\`

- **Single holding over time**: get_holdings_history → compute % return per day as ((price - price_start) / price_start) * 100 → display_type "line", x_key "date", y_keys ["value"], y_label "% return"
- **Compare two holdings**: get_holdings_history for both → normalize to % return from same start → display_type "multi_line", x_key "date", y_keys [ticker1, ticker2], y_label "% return"
- **Portfolio value over time**: get_investment_history → display_type "line", x_key "date", y_keys ["value"], y_label "$ value"

Output the visualization block first, then 2-3 sentences of insight. Do not mention charts or rendering in your prose.

## Your tools
- **get_portfolio_summary** — current total portfolio value plus recent trend. Use first for any general portfolio question.
- **get_holdings** — holdings snapshot for a specific date: ticker, quantity, price, market value, cost basis. Use when asked about specific positions, asset allocation, or gain/loss on individual holdings.
- **get_investment_history** — daily portfolio values over a date range. Use for performance, growth over time, or chart-style questions.
- **get_investment_accounts** — lists the user's linked investment accounts (account_id, account_name, institution). Use when the user refers to a specific institution or account and you need to resolve the correct account_ids.
- **get_holdings_history** — daily price series per ticker per account over a date range. Use when asked about performance of a specific holding or ticker.

Always call a tool before answering. Never guess or fabricate figures.

## Data conventions
- Data is snapshot-based — captured once daily by a background job. Prices are not live; they reflect the most recent daily snapshot.
- Cash held in a brokerage account: show as a position labeled "Cash". Do not filter it out.
- Foreign currency: if the user holds accounts in a different currency, do not convert or sum across currencies. Flag it explicitly — e.g. "Your TFSA account is in CAD and has been excluded from this total. Ask me about it separately."
- Cost basis and gain/loss: show as dollar amount and percentage where available.
- Per-ticker performance: use get_holdings to get quantity at the start date, then get_holdings_history for the price series. Compute dollar gain/loss as quantity × (price_end - price_start). Always note "This assumes you held all N shares for the full period — if you bought or sold during that time, the dollar figure will be approximate."
- Same ticker in multiple accounts: if get_holdings_history returns the same ticker under different account_ids (e.g. mutual fund share classes), do not aggregate — break down by account and show each separately.

- Date ranges: use today's date to compute exact ranges. "This year" = Jan 1 through today. "Last year" = full prior calendar year.
- Amounts: format as dollars (e.g. $12,450.00). Percentages as e.g. +8.3% or -2.1%.

## Format
- Lead with the direct answer. Add one sentence of context from the user's own data if it adds value.
- Use markdown bullet points for lists of holdings or breakdowns — never markdown tables.
- Keep responses concise. Every sentence should add value.
- Tone: neutral, direct, no jargon. Do not offer investment advice or predictions.
- Always answer across all linked investment accounts by default.

## Account clarification
When the user refers to a specific institution or account (e.g. "my Schwab portfolio", "my PCRA Trust"):
1. Call get_investment_accounts to retrieve the list.
2. If exactly one account matches, proceed with its account_id(s).
3. If multiple accounts match (e.g. two Schwab accounts), ask: "I found a few accounts that could match — which one did you mean?" and list them by name. Wait for the reply.
4. If none match, say so clearly.

## Clarifying questions
If a question is ambiguous (e.g. a ticker that could refer to multiple securities, or "my account" with no institution specified), ask one short clarifying question before using your tools.

## Missing data
- No snapshot yet (account just linked): "Your investment account is linked but we haven't taken a snapshot yet — this happens once daily. Check back tomorrow and your portfolio data will be available."

## Scope
You only handle investments, holdings, and portfolio performance. If asked about transactions, spending, or cash flow, respond:
"I can't help with that here — switch to the Transactions tab to ask about your spending."
Do not attempt to answer out-of-scope questions.`

const TOOLS = [
  {
    name: 'get_portfolio_summary',
    description: `Returns the current total portfolio value and recent history.
Use first for any general portfolio question — value, performance, overview.
Returns: { currentValue, history: [{ date, value }] } where history covers the last 30 days.
Edge case: returns { currentValue: null, history: [] } if no snapshots exist yet.`,
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_holdings',
    description: `Returns a holdings snapshot for a specific date: ticker, quantity, price, market value, cost basis.
Use when asked about specific positions, asset allocation, or gain/loss on individual holdings.
Omit date to get the most recent snapshot.
Returns: [{ ticker, security_name, security_type, account_name, quantity, price, value, cost_basis, currency }]
Cash positions appear as ticker: null, security_name: "Cash".`,
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Snapshot date (YYYY-MM-DD). Omit for most recent.',
        },
      },
    },
  },
  {
    name: 'get_investment_accounts',
    description: `Returns the user's linked investment accounts: account_id, account_name, institution.
Use when the user refers to a specific institution or account and you need to resolve account_ids before filtering history.
Returns: [{ account_id, account_name, institution }]`,
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_investment_history',
    description: `Returns daily portfolio values over a date range.
Use for performance, growth over time, or trend questions.
Omit account_ids to get total across all accounts. Pass account_ids to filter to specific accounts — call get_investment_accounts first to resolve them.
Returns: [{ date, value }] ordered by date ascending.
Edge case: returns [] if no data exists for the range.`,
    input_schema: {
      type: 'object',
      properties: {
        since_date: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD). Use today minus the relevant period.',
        },
        account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional. Filter to specific account_ids. Omit for all accounts.',
        },
      },
      required: ['since_date'],
    },
  },
  {
    name: 'get_holdings_history',
    description: `Returns daily price series per ticker per account over a date range.
Use when asked about performance of a specific holding or ticker — e.g. "how has PLTR done since March?".
Returns: [{ date, ticker, account_id, account_name, security_name, security_type, price }] ordered by ticker, account, date.
Note: returns price only, not quantity or value. Use get_holdings to retrieve quantity at the start date so you can compute dollar gain/loss.
If the same ticker appears under multiple account_ids, show them separately — do not aggregate.`,
    input_schema: {
      type: 'object',
      properties: {
        since_date: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD).',
        },
        ticker: {
          type: 'string',
          description: 'Optional. Filter to a single ticker symbol (e.g. "PLTR"). Omit to get all tickers.',
        },
      },
      required: ['since_date'],
    },
  },
]

async function executeTool(name, input, userId, emit) {
  switch (name) {
    case 'get_portfolio_summary': {
      const today = new Date().toISOString().slice(0, 10)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const [currentValue, history] = await Promise.all([
        getLatestPortfolioValue(userId),
        getPortfolioHistory(userId, thirtyDaysAgo),
      ])
      return { currentValue, history }
    }
    case 'get_holdings': {
      const today = new Date().toISOString().slice(0, 10)
      const date = input.date ?? today
      return getHoldingsSnapshotForDate(userId, date)
    }
    case 'get_investment_accounts':
      return getInvestmentAccounts(userId)
    case 'get_investment_history':
      return input.account_ids?.length
        ? getPortfolioAccountHistory(userId, input.since_date, input.account_ids)
        : getPortfolioHistory(userId, input.since_date)
    case 'get_holdings_history': {
      const rows = await getHoldingsHistory(userId, input.since_date)
      return input.ticker ? rows.filter(r => r.ticker?.toUpperCase() === input.ticker.toUpperCase()) : rows
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

async function runAgentLoop(systemPrompt, messages, userId, emit, toolChoice = 'auto') {
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: i === 0 ? toolChoice : 'auto' },
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      const raw = response.content.find(b => b.type === 'text')?.text ?? ''
      return extractAndEmitVisualizations(raw, emit)
    }

    if (response.stop_reason !== 'tool_use') {
      const raw = response.content.find(b => b.type === 'text')?.text ?? ''
      return extractAndEmitVisualizations(raw, emit)
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const callId = `${block.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      emit?.({ type: 'tool_call', tool: block.name, callId })
      let result
      try {
        result = await executeTool(block.name, block.input, userId, emit)
      } catch (err) {
        result = { error: err.message }
      }
      emit?.({ type: 'tool_done', callId, count: Array.isArray(result) ? result.length : null })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return 'I ran into an issue processing your request. Please try again.'
}

/** Called directly from chat.js for known mode — yields full answer as one chunk after tool steps. */
export async function* streamPortfolioAgent({ message, history, userId, emit }) {
  const today = new Date().toISOString().slice(0, 10)
  const hasData = await hasHistoricalPortfolioData(userId, today)
  if (!hasData) {
    const items = await getPlaidItemsByUserId(userId)
    const hasInvestmentAccount = items.some(item =>
      (item.products_granted ?? []).includes('investments')
    )
    if (!hasInvestmentAccount) {
      yield "You haven't linked an investment account yet. Connect one via the Accounts page."
    } else {
      yield "Your investment account is linked but we haven't taken a snapshot yet — this happens once daily. Check back tomorrow and your portfolio data will be available."
    }
    return
  }

  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`
  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'
  const { text } = await runAgentLoop(systemPrompt, messages, userId, emit, toolChoice)
  yield text
}

/** Called by the orchestrator as a tool — runs to completion, returns structured result. */
export async function askPortfolioAgent({ message, history, userId, emit }) {
  const today = new Date().toISOString().slice(0, 10)
  const hasData = await hasHistoricalPortfolioData(userId, today)
  if (!hasData) {
    const items = await getPlaidItemsByUserId(userId)
    const hasInvestmentAccount = items.some(item =>
      (item.products_granted ?? []).includes('investments')
    )
    const answer = !hasInvestmentAccount
      ? "The user hasn't linked an investment account yet."
      : "The user has an investment account linked but no portfolio snapshot has been taken yet."
    return { answer, dataAvailable: false }
  }

  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`
  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'
  try {
    const { text, hasVisualization } = await runAgentLoop(systemPrompt, messages, userId, emit, toolChoice)
    return { answer: text, dataAvailable: true, hasVisualization }
  } catch (err) {
    return { answer: '', dataAvailable: true, hasVisualization: false, error: err.message }
  }
}

registerAgent({
  name: 'portfolio',
  description: `Analyzes investment portfolio, holdings, and stock performance.
Use for questions about: portfolio value, individual holdings, investment returns, asset allocation, stock performance, gain/loss.
Do NOT use for spending or transaction questions.`,
  handler: askPortfolioAgent,
})
