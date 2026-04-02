/**
 * Spending agent — analyzes transactions, spending habits, and cash flow.
 * Registers itself on import via registerAgent().
 */
import Anthropic from '@anthropic-ai/sdk'
import { registerAgent } from '../registry.js'
import { getPlaidItemsByUserId, getTransactionAccounts, getMonthlySpendingByAccount } from '../../db.js'
import { getAgentSpendingSummary, getAgentTransactions, getAgentCashFlow, getAgentCashFlowBreakdown, getAgentCashFlowTimeSeries, getAgentCashFlowNodeTransactions, getAgentCashFlowComparison } from '../queries.js'
import { getRecurringTransactions } from '../../lib/recurring.js'
import { extractAndEmitVisualizations, hasChartIntent } from '../renderChart.js'

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MAX_ITERATIONS = 8

const SYSTEM_PROMPT = `You are the spending analyst for Abacus. You answer questions about the user's transactions, spending habits, and cash flow using your tools.

## Visualizations — read this first
When the user asks for a chart, graph, comparison, or visual breakdown: fetch the data with your tools, then output a visualization block. This is how charts work in this app — you output structured JSON and the UI renders it. You can always do this.

Format:
\`\`\`visualization
{"display_type":"bar","title":"...","data":[...],"x_key":"...","y_keys":["..."],"y_label":"..."}
\`\`\`

- **Spending by category**: get_spending_summary → display_type "bar", x_key "label", y_keys ["value"]
- **Spending over time for one account**: get_accounts → get_monthly_spending_by_account → display_type "line", x_key "date", y_keys ["value"], y_label "$ spent"
- **Comparing multiple accounts**: get_monthly_spending_by_account for each → merge by month → display_type "multi_line", x_key "month", y_keys [name1, name2], y_label "$ spent"
- **Cash flow over time (monthly)**: get_cash_flow → display_type "multi_line", x_key "month", y_keys ["inflows","outflows"]
- **Cash flow over time (custom range)**: get_cash_flow_time_series → display_type "multi_line", x_key "bucket", y_keys ["inflows","outflows"], y_label "$"
- **Cash flow breakdown (income vs expenses by category)**: get_cash_flow_breakdown → display_type "bar", x_key "name", y_keys ["amount"]

Output the visualization block first, then 2-3 sentences of insight. Do not mention charts or rendering in your prose.

## Understanding user intent
People rarely use financial jargon. Map their everyday language to the right tool:

| What they say | What they mean | Tool to use |
|---|---|---|
| "where is my money going?" / "what am I spending on?" / "what's eating my paycheck?" | category breakdown of expenses | get_cash_flow_breakdown (breakdown: group) |
| "am I saving enough?" / "am I living within my means?" / "how much do I have left?" | savings rate, income vs expenses | get_cash_flow_breakdown |
| "how much did I make?" / "how much came in?" / "what's my income?" | income total | get_cash_flow_breakdown |
| "how much did I spend?" / "did I overspend?" / "what did I blow money on?" | spending total or breakdown | get_spending_summary or get_cash_flow_breakdown |
| "what am I paying for?" / "what are my bills?" / "what subscriptions do I have?" | recurring bills and subscriptions | get_recurring_transactions |
| "how's this month looking?" / "how am I doing?" (in spending context) | month-to-date income vs expenses | get_cash_flow_breakdown (period: month) |
| "is it getting worse?" / "am I spending more than before?" | trend over time | get_cash_flow or get_cash_flow_time_series |
| "how does this month compare to last month?" / "did I spend more this month?" | period-over-period comparison | compare_cash_flow |
| "how was my cash flow last week?" / "show me daily spending for March" | granular time-series | get_cash_flow_time_series |
| "what's in my food spending?" / "break down that $800" / "show me the rent payments" | drill into a category from breakdown | get_cash_flow_node_transactions (after get_cash_flow_breakdown) |
| "show me my Uber rides" / "what did I buy at Target?" | specific transactions | get_transactions |

When in doubt, prefer get_cash_flow_breakdown — it covers income, expenses, net, and savings rate in one call.

## Your tools
- **get_spending_summary** — total spending and category breakdown for a date range. Use for "how much did I spend?" or any question about spending amounts, totals, or category breakdowns where you don't need income data.
- **get_transactions** — individual transactions for a date range. Use when the user asks about specific purchases, merchants, or wants to see a list of charges. Do not use this to compute totals — use get_spending_summary for that.
- **get_cash_flow** — monthly inflows and outflows for up to 24 months. Use for trend questions like "is it getting better or worse?", "how has my spending changed?", or income vs. spending over time.
- **get_cash_flow_time_series** — inflows, outflows, and net for a custom date range with day/week/month granularity. Use when the user specifies exact dates ("how was March?"), wants daily or weekly detail, or needs finer resolution than monthly. Prefer over get_cash_flow when dates or non-monthly granularity are involved.
- **get_cash_flow_breakdown** — income and expense breakdown by category, group, or merchant for a period (week/month/quarter/year). This is your most versatile tool. Use when asked about savings rate, where money is going, biggest expenses, income sources, or any question that involves both money in and money out. Returns totals, net, and savings rate. Prefer this over get_spending_summary when the question involves both income and expenses.
- **get_cash_flow_node_transactions** — drill into a specific category/group/merchant from a cash flow breakdown to see the individual transactions behind it. Use after get_cash_flow_breakdown when the user wants detail on a specific category (e.g. "what's in my Food & Drink spending?", "show me my rent payments", "what makes up that $800 in shopping?"). Requires the category_key from the breakdown results.
- **compare_cash_flow** — compare income, expenses, savings rate, and category-level changes between two date ranges. Use when the user asks "how does this month compare to last month?", "am I spending more than usual?", "did I improve?", or any period-over-period question. Returns headline deltas and the top categories that changed most. Start your response with the most important insight.
- **get_recurring_transactions** — recurring bills and subscriptions detected by Plaid. Use when the user asks about subscriptions, upcoming bills, recurring charges, or things they might be paying for without realizing it.
- **get_accounts** — lists the user's linked accounts (account_id, account_name). Use when the user asks about a specific account or institution and you need to identify the correct account_id.
- **get_monthly_spending_by_account** — monthly spending totals for a single account. Use when asked to visualize or summarize spending for a specific account over time.

Always call a tool before answering. Never guess or fabricate figures.

## Data conventions
- Amounts: positive = money out (expense), negative = money in (income or refund).
- Refunds: net out refunds from the same merchant automatically. Show net spend, and note the refund briefly — e.g. "Patagonia — $140.50 net ($425.48 charge, $284.98 refund)".
- Pending transactions: include in all responses by default. If pending transactions are included, note it briefly — e.g. "includes 3 pending transactions".
- Date ranges: use today's date to compute exact ranges. "Last month" = full calendar month before today's month. "This month" = first of the current month through today. "Last week" = the 7 days ending yesterday.
- Categories: display in plain English (e.g. "Food & Drink", not "FOOD_AND_DRINK").
- Amounts: format as dollars (e.g. $142.50).

## Account clarification
When the user mentions a specific bank or account (e.g. "Chase card", "my savings account"):
1. Call get_accounts to retrieve the list.
2. If exactly one account matches, proceed.
3. If multiple match, ask the user: "I found a few accounts that could match — which one did you mean?" and list them by name. Wait for the user's reply before fetching data.
4. If none match, say so clearly.

## Format
- Lead with the direct answer. Add one sentence of context from the user's own data if it adds value.
- Use markdown bullet points for lists of categories or transactions — never markdown tables.
- Keep responses concise. Every sentence should add value.
- Tone: neutral, direct, no jargon.
- Always answer across all linked accounts by default. State this explicitly — e.g. "across all your linked accounts, you spent $4,200 last month." Offer to break down by account after answering.

## Clarifying questions
If a question is ambiguous (e.g. "how am I doing?" could mean many things), ask one short, specific clarifying question before using your tools.

## Scope
You only handle spending, transactions, and cash flow. If asked about investments, portfolio, holdings, or stock performance, respond:
"I can't help with that here — switch to the Investments tab to ask about your portfolio."
Do not attempt to answer out-of-scope questions.`

const TOOLS = [
  {
    name: 'get_spending_summary',
    description: `Returns total spending and a breakdown by category for a date range.
Use this first when asked about spending amounts, budgets, or category breakdowns.
Returns: { total, categories: [{ category, total, transaction_count }] }
Edge case: returns { total: 0, categories: [] } if no transactions in range — do not retry with different dates.`,
    input_schema: {
      type: 'object',
      properties: {
        after_date: { type: 'string', description: 'Start of date range, inclusive (YYYY-MM-DD)' },
        before_date: { type: 'string', description: 'End of date range, inclusive (YYYY-MM-DD)' },
        category: {
          type: 'string',
          description: 'Optional: filter to a specific Plaid primary category (e.g. FOOD_AND_DRINK, TRAVEL). Omit to get all categories.',
        },
      },
      required: ['after_date', 'before_date'],
    },
  },
  {
    name: 'get_transactions',
    description: `Returns individual transactions for a date range.
Use when the user asks about specific purchases, merchants, or wants a list.
Use get_spending_summary instead for totals — do not use this to compute sums.
Returns: [{ merchant, amount, date, category, account, pending }]
Positive amount = expense, negative = income or refund.`,
    input_schema: {
      type: 'object',
      properties: {
        after_date: { type: 'string', description: 'Start of date range (YYYY-MM-DD)' },
        before_date: { type: 'string', description: 'End of date range (YYYY-MM-DD)' },
        category: { type: 'string', description: 'Optional: filter to a Plaid category' },
        spending_only: {
          type: 'boolean',
          description: 'If true, exclude income and transfers but keep refunds. Use when the user asks about spending or purchases.',
        },
      },
    },
  },
  {
    name: 'get_cash_flow',
    description: `Returns monthly inflows and outflows for up to 24 months.
Use when asked about savings rate, income vs. spending trends, or net cash flow over time.
Returns: [{ month: 'YYYY-MM', inflows, outflows, net }] ordered most recent first.
Edge case: returns [] if no transactions exist yet.`,
    input_schema: {
      type: 'object',
      properties: {
        months_back: {
          type: 'number',
          description: 'Number of months to look back (default 12, max 24)',
        },
        account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: filter to specific account IDs. Get IDs from get_accounts.',
        },
      },
    },
  },
  {
    name: 'get_cash_flow_time_series',
    description: `Returns inflows, outflows, and net for a custom date range with day/week/month granularity.
Use when the user specifies exact dates, wants daily or weekly detail, or needs finer resolution than monthly.
Prefer over get_cash_flow when exact dates or non-monthly granularity are needed.
Returns: { start_date, end_date, granularity, buckets: [{ bucket, inflows, outflows, net }] }
Edge case: returns { buckets: [] } if no transactions in range.`,
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start of date range, inclusive (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End of date range, inclusive (YYYY-MM-DD)' },
        granularity: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          description: 'How to bucket the data (default: month). Use day for ranges ≤14 days, week for ≤90 days, month for longer.',
        },
        account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: filter to specific account IDs. Get IDs from get_accounts.',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'compare_cash_flow',
    description: `Compare cash flow between two date ranges — income, expenses, net, savings rate, and per-category changes.
Use when the user asks how one period compares to another, whether spending is getting better or worse, or any "vs" question.
Returns: { current, previous, delta, category_changes: [{ name, current, previous, delta, pct_change }] }
category_changes sorted by largest absolute delta — lead your response with the top movers.`,
    input_schema: {
      type: 'object',
      properties: {
        current_start_date: { type: 'string', description: 'Start of the current/recent period (YYYY-MM-DD)' },
        current_end_date: { type: 'string', description: 'End of the current/recent period (YYYY-MM-DD)' },
        previous_start_date: { type: 'string', description: 'Start of the comparison period (YYYY-MM-DD)' },
        previous_end_date: { type: 'string', description: 'End of the comparison period (YYYY-MM-DD)' },
        breakdown: {
          type: 'string',
          enum: ['category', 'group', 'merchant'],
          description: 'How to group category changes (default: group for readability)',
        },
      },
      required: ['current_start_date', 'current_end_date', 'previous_start_date', 'previous_end_date'],
    },
  },
  {
    name: 'get_recurring_transactions',
    description: `Returns recurring bills and subscriptions detected by Plaid from transaction history.
Use when the user asks about subscriptions, upcoming bills, recurring charges, or forgotten charges.
Returns: [{ merchant, average_amount, last_amount, frequency, predicted_next_date, last_date, category, status }]
Sorted by next predicted payment date ascending.`,
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_accounts',
    description: `Returns the user's linked transaction accounts: account_id and account_name.
Use when the user refers to a specific bank or account (e.g. "Chase card", "my savings") and you need to resolve the correct account_id before fetching data.
Returns: [{ account_id, account_name }]`,
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_monthly_spending_by_account',
    description: `Returns monthly spending totals for a single account.
Use when the user asks to chart or summarize spending for a specific account over time.
Requires account_id — call get_accounts first if you don't have it.
Returns: [{ month: 'YYYY-MM', total }] ordered by month ascending.`,
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'The account_id to filter by.' },
        months_back: { type: 'number', description: 'Number of months to look back (default 12, max 36).' },
      },
      required: ['account_id'],
    },
  },
  {
    name: 'get_cash_flow_node_transactions',
    description: `Drill into a specific category, group, or merchant from a cash flow breakdown to see individual transactions.
Use after get_cash_flow_breakdown when the user wants to see what's behind a specific line item.
Returns: { period, flow_type, category_key, breakdown, transaction_count, transactions: [{ merchant, amount, date, account, category, pending }] }`,
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Same period used in the breakdown query',
        },
        flow_type: {
          type: 'string',
          enum: ['income', 'expense'],
          description: 'Whether to drill into an income source or expense category',
        },
        category_key: {
          type: 'string',
          description: 'The category/group/merchant name from the breakdown results (e.g. "FOOD_AND_DRINK", "Housing", "Uber"). Use exact value from get_cash_flow_breakdown.',
        },
        breakdown: {
          type: 'string',
          enum: ['category', 'group', 'merchant'],
          description: 'Must match the breakdown used in get_cash_flow_breakdown (default: category)',
        },
      },
      required: ['period', 'flow_type', 'category_key'],
    },
  },
  {
    name: 'get_cash_flow_breakdown',
    description: `Returns income and expense breakdown by category, group, or merchant for a period.
Use when asked about savings rate, where money is going, biggest expense categories, income sources, or any category-level cash flow analysis.
Returns: { period, breakdown, income: { total, categories }, expenses: { total, categories }, net, savings_rate_percent }
Prefer this over get_spending_summary when the question involves both income and expenses.
Supports both preset periods (week/month/quarter/year) and custom date ranges via start_date + end_date.`,
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Time period to analyze (default: month). Ignored if start_date and end_date are provided.',
        },
        breakdown: {
          type: 'string',
          enum: ['category', 'group', 'merchant'],
          description: 'How to group the data (default: category)',
        },
        account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: filter to specific account IDs. Get IDs from get_accounts.',
        },
        start_date: {
          type: 'string',
          description: 'Optional: custom start date YYYY-MM-DD (inclusive). Use with end_date instead of period.',
        },
        end_date: {
          type: 'string',
          description: 'Optional: custom end date YYYY-MM-DD (inclusive). Use with start_date instead of period.',
        },
      },
    },
  },
]

async function executeTool(name, input, userId, emit) {
  switch (name) {
    case 'get_spending_summary':
      return getAgentSpendingSummary(userId, input.after_date, input.before_date, input.category ?? null)
    case 'get_transactions':
      return getAgentTransactions(userId, {
        afterDate: input.after_date,
        beforeDate: input.before_date,
        category: input.category,
        spendingOnly: input.spending_only,
      })
    case 'get_cash_flow':
      return getAgentCashFlow(userId, input.months_back ?? 12, input.account_ids ?? null)
    case 'get_cash_flow_time_series':
      return getAgentCashFlowTimeSeries(userId, input.start_date, input.end_date, input.granularity ?? 'month', input.account_ids ?? null)
    case 'compare_cash_flow':
      return getAgentCashFlowComparison(
        userId,
        { startDate: input.current_start_date, endDate: input.current_end_date },
        { startDate: input.previous_start_date, endDate: input.previous_end_date },
        input.breakdown ?? 'group'
      )
    case 'get_recurring_transactions':
      return { recurring_transactions: await getRecurringTransactions(userId) }
    case 'get_accounts':
      return getTransactionAccounts(userId)
    case 'get_monthly_spending_by_account':
      return getMonthlySpendingByAccount(userId, input.account_id, input.months_back ?? 12)
    case 'get_cash_flow_node_transactions':
      return getAgentCashFlowNodeTransactions(userId, input.period, input.flow_type, input.category_key, input.breakdown ?? 'category')
    case 'get_cash_flow_breakdown': {
      const customRange = input.start_date && input.end_date
        ? { startDate: input.start_date, endDate: input.end_date }
        : null
      return getAgentCashFlowBreakdown(userId, input.period ?? 'month', input.breakdown ?? 'category', input.account_ids ?? null, customRange)
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
export async function* streamSpendingAgent({ message, history, userId, emit }) {
  const items = await getPlaidItemsByUserId(userId)
  const hasTransactionAccounts = items.some(item =>
    (item.products_granted ?? []).includes('transactions')
  )
  if (!hasTransactionAccounts) {
    yield "You haven't linked any bank or card accounts yet. Connect one via the Accounts page."
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`
  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'
  const { text } = await runAgentLoop(systemPrompt, messages, userId, emit, toolChoice)
  yield text
}

/** Called by the orchestrator as a tool — runs to completion, returns structured result. */
export async function askSpendingAgent({ message, history, userId, emit }) {
  const items = await getPlaidItemsByUserId(userId)
  const hasTransactionAccounts = items.some(item =>
    (item.products_granted ?? []).includes('transactions')
  )
  if (!hasTransactionAccounts) {
    return {
      answer: "The user hasn't linked any bank or card accounts yet.",
      dataAvailable: false,
    }
  }

  const today = new Date().toISOString().slice(0, 10)
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
  name: 'spending',
  description: `Analyzes transactions, spending habits, cash flow, income, and budgets.
Use for questions about: how much was spent, spending by category, specific purchases, cash flow trends, savings rate, income vs. expenses.
Also use for everyday phrasing like: "where is my money going?", "am I saving enough?", "how much did I make?", "what am I paying for?", "can I afford this?", "how much do I have left?", "what's eating up my paycheck?", "am I living within my means?", "how much came in vs went out?", "what are my bills?", "did I overspend?", "what did I blow money on?".
Do NOT use for investment or portfolio questions (e.g. stock prices, holdings, portfolio performance).`,
  handler: askSpendingAgent,
})
