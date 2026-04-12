/**
 * Accounts agent — answers questions about account balances, net worth, credit, and linked institutions.
 * Registers itself on import via registerAgent().
 *
 * Live balance path: reads accounts_cache from plaid_items (written on every /connections load).
 * Falls back to account_balance_snapshots if cache is empty.
 * Investment totals for net worth come from portfolio_account_snapshots (computed from holdings).
 */
import Anthropic from '@anthropic-ai/sdk'
import { registerAgent } from '../registry.js'
import { extractAndEmitVisualizations, hasChartIntent } from '../renderChart.js'
import { todayET, toDateStrET } from '../../lib/dateUtils.js'
import {
  getPlaidItemsByUserId,
  getLatestAccountBalances,
  getLatestInvestmentAccountBalances,
  getAccountBalanceHistory,
} from '../../db.js'

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MAX_ITERATIONS = 8

const SYSTEM_PROMPT = `You are the accounts analyst for Abacus. You answer questions about the user's account balances, net worth, credit, and linked institutions using your tools.

## Visualizations — read this first
When the user asks for a chart, graph, or visual trend: fetch the data, then output a visualization block. This is how charts work in this app — you output structured JSON and the UI renders it. You can always do this.

Format:
\`\`\`visualization
{"display_type":"line","title":"...","data":[...],"x_key":"...","y_keys":["..."],"y_label":"..."}
\`\`\`

- **Account balance over time**: get_balance_history → display_type "line", x_key "date", y_keys ["current"], y_label "$ balance"
- **Balance breakdown by account**: get_current_balances → display_type "bar", x_key "account_name", y_keys ["current"], y_label "$ balance"

Output the visualization block first, then 2–3 sentences of insight. Do not mention charts or rendering in your prose.

## Your tools
- **get_current_balances** — live balances for depository, credit, and loan accounts (from cache, updated when user views Accounts page). Use first for any question about current balances or available credit. Also use to resolve account names to IDs before calling get_balance_history.
- **get_net_worth** — current net worth combining all account types. Depository/credit/loan from live cache; investment totals from daily portfolio snapshots (computed from actual holdings — more accurate than a raw Plaid balance). Use when asked about net worth, total assets, or total liabilities.
- **get_balance_history** — daily balance snapshots over a date range (depository/credit/loan only). Use when asked how a balance has changed over time.
- **get_connected_accounts** — linked institutions and what products they provide. Use when asked which accounts are linked or whether a specific bank is connected.

Always call a tool before answering. Never guess or fabricate figures.

## Data conventions
- Balances from get_current_balances: from cache updated when user last viewed their accounts. If is_live is false, you are seeing snapshot data — note the as_of_date.
- Investment account values in get_net_worth: from daily portfolio snapshots (computed from actual holdings), not a live Plaid balance.
- Net worth: assets (depository + investment) minus liabilities (credit + loan). Always show the breakdown alongside the net figure.
- Balance history: snapshot-based, captured once daily by a background job. If the range returns no data, say so and suggest a shorter range.
- Credit utilization: current ÷ credit_limit × 100. Note this as a data point only — do not frame as advice.
- Available balance: for depository = usable funds (may differ from current due to holds). For credit = remaining credit.
- Foreign currency: do not sum across currencies. Flag each separately — e.g. "Your TFSA is in CAD and has been excluded from this total."
- Amounts: format as dollars (e.g. $12,450.00). Percentages as e.g. 24.3%.
- Date ranges: "this year" = Jan 1 through today. "Last month" = full prior calendar month.

## Format
- Lead with the direct answer. Add one sentence of context from the user's own data if it adds value.
- Use markdown bullet points for account lists — never markdown tables.
- Keep responses concise. Every sentence should add value.
- Tone: neutral, direct, no jargon. Do not offer financial advice or recommendations.

## Account clarification
When the user refers to a specific institution or account name:
1. Call get_current_balances to see what's linked.
2. If exactly one match, proceed.
3. If multiple matches (e.g. two Chase accounts), ask: "I found a few that could match — which one did you mean?" and list by name. Wait for reply.
4. If no match, say so clearly.

## Missing data
- No balance data yet (account just linked or cron hasn't run): "Your account is linked but we haven't captured a balance snapshot yet — this happens once daily. Check back tomorrow."
- No accounts linked: return dataAvailable: false.
- Balance history returns empty for a range: say so and suggest trying a shorter range.

## Scope
You only handle account balances, net worth, credit, and connected institutions. If asked about specific transactions or spending patterns, respond:
"I can't help with that here — switch to the Transactions tab to ask about your spending."
If asked about investment performance, holdings, or stock prices, respond:
"I can't help with that here — switch to the Investments tab to ask about your portfolio."
Do not attempt to answer out-of-scope questions.`

const TOOLS = [
  {
    name: 'get_current_balances',
    description: `Returns live balances for depository, credit, and loan accounts.
Reads from the in-app cache (updated when user last viewed their Accounts page).
Falls back to latest account_balance_snapshots if cache is unavailable.
Does NOT include investment accounts — use get_net_worth for a full picture including investments.
Use first for any question about current balances, available credit, or to resolve account names to IDs.
Returns: [{ account_id, account_name, institution_name, type, subtype, current, available, credit_limit, currency, is_live }]
- type: "depository" | "credit" | "loan" | "other"
- credit_limit: set for credit accounts; null otherwise (may also be null in live cache — use snapshot data if needed)
- is_live: true if from cache, false if from snapshot fallback (with as_of_date set)
- Edge case: returns [] if no data exists yet`,
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_net_worth',
    description: `Returns current net worth: depository/credit/loan balances (live cache) + investment account totals (portfolio snapshots).
Investment values come from portfolio_account_snapshots computed from actual holdings — more accurate than Plaid's accountsGet.
Returns: { net_worth, assets, liabilities, by_account: [{ account_id, account_name, institution_name, type, current }] }
Use when asked about net worth, total assets, or total liabilities.`,
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_balance_history',
    description: `Returns daily balance snapshots over a date range for depository/credit/loan accounts.
Use when asked how a balance has changed over time, or for trend/chart questions.
Call get_current_balances first to resolve an account name to its account_id before filtering.
Returns: [{ date, account_id, account_name, institution_name, type, subtype, current, available }] ordered by date ascending.
Edge case: returns [] if no snapshot history exists for the range.`,
    input_schema: {
      type: 'object',
      properties: {
        since_date: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD). Use today minus the relevant period.',
        },
        account_id: {
          type: 'string',
          description: 'Optional. Filter to a single account_id. Omit for all accounts.',
        },
      },
      required: ['since_date'],
    },
  },
  {
    name: 'get_connected_accounts',
    description: `Returns the user's linked Plaid items (institutions) and which product categories they provide.
Use when asked which accounts are linked or whether a specific bank is connected.
Returns: [{ institution_name, products_granted: string[], linked_at }]
products_granted values: "transactions", "investments"`,
    input_schema: { type: 'object', properties: {} },
  },
]

/** Read balances from plaid_items.accounts_cache (written on every /connections load). */
async function getLiveCachedBalances(userId) {
  const items = await getPlaidItemsByUserId(userId)
  const results = []
  for (const item of items) {
    const cached = item.accounts_cache
    if (!cached) continue
    let accounts
    try {
      accounts = typeof cached === 'string' ? JSON.parse(cached) : cached
    } catch { continue }
    for (const acc of accounts ?? []) {
      // Skip investment accounts — their values come from portfolio snapshots
      if (acc.type === 'investment') continue
      results.push({
        account_id: acc.account_id,
        account_name: acc.name,
        institution_name: item.institution_name ?? null,
        type: acc.type ?? 'other',
        subtype: acc.subtype ?? null,
        current: acc.current ?? null,
        available: acc.available ?? null,
        credit_limit: null, // not stored in accounts_cache — use snapshot for credit_limit
        currency: acc.currency ?? 'USD',
        is_live: true,
      })
    }
  }
  return results
}

async function executeTool(name, input, userId) {
  switch (name) {
    case 'get_current_balances': {
      const live = await getLiveCachedBalances(userId)
      if (live.length > 0) return live
      // Fallback to snapshots
      const snapshots = await getLatestAccountBalances(userId)
      return snapshots.map(r => ({
        account_id: r.account_id,
        account_name: r.account_name,
        institution_name: r.institution_name,
        type: r.type,
        subtype: r.subtype,
        current: r.current != null ? parseFloat(r.current) : null,
        available: r.available != null ? parseFloat(r.available) : null,
        credit_limit: r.credit_limit != null ? parseFloat(r.credit_limit) : null,
        currency: r.currency,
        is_live: false,
        as_of_date: r.as_of_date,
      }))
    }

    case 'get_net_worth': {
      const [live, investmentRows] = await Promise.all([
        getLiveCachedBalances(userId),
        getLatestInvestmentAccountBalances(userId),
      ])

      const nonInvestment = live.length > 0 ? live : (await getLatestAccountBalances(userId)).map(r => ({
        account_id: r.account_id,
        account_name: r.account_name,
        institution_name: r.institution_name,
        type: r.type,
        current: r.current != null ? parseFloat(r.current) : 0,
      }))

      const ASSET_TYPES = new Set(['depository', 'investment'])
      const DEBT_TYPES = new Set(['credit', 'loan'])

      let assets = 0, liabilities = 0
      const by_account = []

      for (const acc of nonInvestment) {
        const val = parseFloat(acc.current ?? 0)
        if (ASSET_TYPES.has(acc.type)) {
          assets += val
          by_account.push({ account_id: acc.account_id, account_name: acc.account_name, institution_name: acc.institution_name, type: acc.type, current: Math.round(val * 100) / 100 })
        } else if (DEBT_TYPES.has(acc.type)) {
          liabilities += Math.abs(val)
          by_account.push({ account_id: acc.account_id, account_name: acc.account_name, institution_name: acc.institution_name, type: acc.type, current: Math.round(-Math.abs(val) * 100) / 100 })
        }
      }

      for (const inv of investmentRows) {
        const val = parseFloat(inv.current ?? 0)
        assets += val
        by_account.push({ account_id: inv.account_id, account_name: inv.account_name, institution_name: inv.institution_name, type: 'investment', current: Math.round(val * 100) / 100 })
      }

      return {
        net_worth: Math.round((assets - liabilities) * 100) / 100,
        assets: Math.round(assets * 100) / 100,
        liabilities: Math.round(liabilities * 100) / 100,
        by_account,
      }
    }

    case 'get_balance_history': {
      const rows = await getAccountBalanceHistory(userId, {
        afterDate: input.since_date,
        accountId: input.account_id,
      })
      return rows.map(r => ({
        ...r,
        date: r.date instanceof Date ? toDateStrET(r.date) : String(r.date).slice(0, 10),
        current: r.current != null ? parseFloat(r.current) : null,
        available: r.available != null ? parseFloat(r.available) : null,
      }))
    }

    case 'get_connected_accounts': {
      const items = await getPlaidItemsByUserId(userId)
      return items.map(item => ({
        institution_name: item.institution_name ?? 'Unknown',
        products_granted: item.products_granted ?? [],
        linked_at: item.created_at,
      }))
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
        result = await executeTool(block.name, block.input, userId)
      } catch (err) {
        result = { error: err.message }
      }
      emit?.({ type: 'tool_done', callId, count: Array.isArray(result) ? result.length : null })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return { text: 'I ran into an issue processing your request. Please try again.', hasVisualization: false }
}

/** Called directly from chat.js for known mode. */
export async function* streamAccountsAgent({ message, history, userId, emit }) {
  const items = await getPlaidItemsByUserId(userId)
  if (items.length === 0) {
    yield "You haven't linked any accounts yet. Connect one via the Accounts page."
    return
  }

  const today = todayET()
  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`
  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'
  const { text } = await runAgentLoop(systemPrompt, messages, userId, emit, toolChoice)
  yield text
}

/** Called by the orchestrator as a tool. */
export async function askAccountsAgent({ message, history, userId, emit }) {
  const items = await getPlaidItemsByUserId(userId)
  if (items.length === 0) {
    return { answer: "The user hasn't linked any accounts yet.", dataAvailable: false }
  }

  const today = todayET()
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
  name: 'accounts',
  description: `Reports on account balances, net worth, credit, and linked institutions.
Use for questions about: current balances, net worth (assets vs liabilities), available credit,
credit utilization, which banks are connected, how balances have changed over time.
Do NOT use for spending/transaction questions or investment performance questions.`,
  handler: askAccountsAgent,
})
