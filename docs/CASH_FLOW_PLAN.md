# Cash Flow Chart — Implementation & Plan

## What it shows

Monthly inflows (money in) and outflows (money out) as paired bars, with a net line connecting each month's result. The header shows the current month's net. The goal is to give the user a simple answer to "am I saving money each month?"

---

## Current implementation

### Data source

Reads from the `transactions` table — same data as Recent Transactions and the Spending chart. No separate aggregation table; computed fresh on each request.

### Backend — `getMonthlyCashFlow` (`server/db.js`)

```sql
SELECT to_char(date_trunc('month', COALESCE(authorized_date, date)), 'YYYY-MM') AS month,
       SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS inflows,
       SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS outflows
FROM transactions
WHERE user_id = $1
  AND (personal_finance_category_detailed IS NULL
       OR personal_finance_category_detailed != ALL($3))
GROUP BY date_trunc('month', COALESCE(authorized_date, date))
ORDER BY month DESC
LIMIT $2
```

- **Plaid sign convention:** positive amount = money out (expense); negative amount = money in (income)
- **Inflows:** `amount < 0` rows, summed as ABS
- **Outflows:** `amount > 0` rows, summed as-is
- **Net:** computed client-side as `inflows - outflows`
- Uses `COALESCE(authorized_date, date)` — prefers authorized date for more accurate month bucketing
- Returns up to 24 months, ordered DESC (frontend reverses to chronological)

### Route — `GET /api/plaid/cash-flow`

- `?months=N` — number of months to return (1–24, default 12, frontend requests 24)
- Returns `{ months: [{ month, inflows, outflows, net }] }`

### Frontend — `src/components/CashFlowChart.jsx`

- **Time window:** Always renders **YTD only** (Jan → current month of current year), even though the backend supports 24 months. Empty months are filled with zeros so the full year is always visible.
- **Chart type:** `ComposedChart` — inflow bars up, outflow bars mirrored below zero axis (`negativeFlow = -(outflows)`), net as a line
- **Y-axis:** Symmetric domain computed from data extremes + 5% padding, snapped to round increments ($500, $2k, $5k etc.)
- **Colors:** Blue (#1e40af) for inflows, orange (#ea580c) for outflows — colorblind-friendly

---

## What's included and excluded

| Type | Included | Reason |
|------|----------|--------|
| Income & deposits | ✅ Inflow | Legitimate money in |
| Purchases & payments | ✅ Outflow | Legitimate money out |
| Loan payments (mortgage, auto, personal) | ✅ Outflow | Real cost |
| Merchant refunds / returns | ✅ Inflow | Negative Plaid amounts — cash returned to account; correctly increases inflow total |
| Transfers between linked accounts | ❌ Excluded | Would double-count inter-account moves as both inflow and outflow |
| Credit card payments | ❌ Excluded | Would double-count individual transactions already captured on the card |
| Line of credit payments | ❌ Excluded | Same reason |
| Credit card "Payment Thank You" (on card account) | ❌ Excluded | Mirror of the credit card payment on the checking side — both sides excluded to prevent false inflow |

Exclusion is implemented via `NON_SPENDING_DETAILED_CATEGORIES` on `personal_finance_category_detailed`.

### Refunds and returns

Merchant refunds have negative Plaid amounts (money in), so they are naturally bucketed as **inflows** by the `amount < 0` condition in `getMonthlyCashFlow`. This is correct cash flow behavior — a refund is real money returning to the account.

Cash flow does **not** net refunds against the original purchase outflow. Instead:
- The original purchase appears as an outflow in the month it was charged
- The refund appears as an inflow in the month it was credited

This matches real cash movement and is the right framing for "am I saving money this month?" — both the cash out and the cash back are visible as discrete events.

**Contrast with the Spending chart:** The spending chart nets refunds against purchases within the same bucket (a $100 purchase + $30 refund in March shows $70 net spending for March). Cash flow does not net — it shows the gross flows in both directions. The two charts answer different questions.

---

## Known limitations

### ~~1. Inter-account transfers are double-counted~~ ✅ Fixed
`TRANSFER_IN` and `TRANSFER_OUT` are now excluded from `getMonthlyCashFlow` via `CASH_FLOW_EXCLUDED_CATEGORIES`.

### 2. YTD-only view — no multi-year or rolling window
The frontend hard-codes Jan → current month of the current year. The backend supports up to 24 months but that data is unused. Users can't see last year or a trailing 12-month view.

**Fix:** Add a year selector or a "Last 12 months / This year" toggle. Backend already supports it; frontend change only.

### 3. No account filtering
The spending chart has account filter pills. Cash flow has none — it always shows all accounts. If a user wants to see cash flow for just one institution, they can't.

**Fix:** Pass `account_ids` filter to `getMonthlyCashFlow` (same pattern as `getSpendingSummaryByAccount`).

### 4. Unlinked credit card spending gap
Credit card payments are excluded to prevent double-counting. If a user pays a credit card that is NOT linked in Plaid, the payment is excluded and those purchases are invisible. See `ACCOUNT_CONNECTION_FLOW.md` → Known Limitations.

### 5. Plaid miscategorization causes excluded transactions to slip through *(accepted, documented)*
Our exclusion logic depends entirely on Plaid's `personal_finance_category` and `personal_finance_category_detailed` fields. When Plaid assigns Low confidence and falls back to `OTHER / OTHER`, excluded transaction types (e.g. credit card payments) are not caught and appear in cash flow totals.

**Example:** A "CHASE CREDIT CRD" payment from a 360 Checking account was categorized as `OTHER / OTHER` (Low confidence) instead of `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`. It appeared as an outflow despite credit card payments being excluded.

There is no safe programmatic fix — name-pattern matching would be too fragile and could silently exclude unrelated transactions (violates surgical solutions principle).

**Future fix:** Allow users to manually override a transaction's category. A user-set category would take precedence over Plaid's, enabling them to flag miscategorized transactions so they are correctly excluded from cash flow and spending totals.

### 6. Pending transactions *(accepted, documented)*
Pending transactions are included in monthly totals using their `date` (no `authorized_date` yet). When they settle, two things can happen silently:
- They receive an `authorized_date` in a different month → transaction moves to a different month's bucket
- Their category changes on settlement → they may shift from outflow to excluded (or vice versa)

This means past months' totals can change slightly after settlement with no indication to the user. Accepted as a known limitation for now — the impact is typically small (pending transactions settle within 1–3 days) and fixing it would require either excluding all pending transactions from totals (undercounts current month) or adding a "may change" indicator on affected months.

---

## Open questions

- Should we show a savings rate (net / inflows × 100) in the header or tooltip?
- Multi-year: year selector or trailing 12 months? YTD resets to near-zero in January which can look misleading.
- Current month is always incomplete — should we label it "MTD" or dim it to set expectations?

---

## Potential improvements (not committed)

- **Exclude TRANSFER_IN / TRANSFER_OUT** to eliminate inter-account noise
- **Year selector** — show this year, last year, or trailing 12 months
- **Account filter** — same filter pills as Spending chart
- **Savings rate** — show `net / inflows` as a percentage in the header
- **CSV export** — monthly breakdown table for the current view

---

# Cash Flow Page with Sankey Diagram

## What it shows

A dedicated Cash Flow page (`/app/cash-flow`) that visualizes money flow from income sources to expense categories using a Sankey diagram. Users can break down data by category, group, or merchant, and filter by time period (week/month/quarter/year) and financial accounts.

A summary card shows total income, total expenses, net income, and savings rate %.

---

## Implementation

### Backend

#### New DB function: `getCashFlowBreakdown` (`server/db.js`)

Groups transactions by `flow_type` (income/expense) and a `category_key` dimension:
- `category`: uses `personal_finance_category`
- `group`: maps Plaid categories to coarser groups (Food & Dining, Housing, Financial, etc.) via `CATEGORY_GROUP_MAP`
- `merchant`: uses `COALESCE(merchant_name, name)`

Supports period filtering: `week` (7 days), `month` (calendar month), `quarter` (quarter start), `year` (Jan 1).

Excludes TRANSFER_IN/TRANSFER_OUT and `NON_SPENDING_DETAILED_CATEGORIES` (same as cash flow chart). Does NOT exclude INCOME (needed for the left side of the Sankey).

#### New route: `GET /api/plaid/cash-flow-breakdown`

Query params: `period` (required), `breakdown` (optional, default `category`), `account_ids` (optional, comma-separated).

Response:
```json
{
  "period": "month",
  "breakdown": "category",
  "income": { "total": 8500.00, "categories": [{ "name": "INCOME", "amount": 7500 }] },
  "expenses": { "total": 6200.00, "categories": [{ "name": "MORTGAGE", "amount": 2500 }, ...] }
}
```

### Frontend

#### Sankey visualization: `src/components/SankeyDiagram.jsx`

Uses `d3-sankey` for layout computation + custom SVG rendering (Recharts has no Sankey support).

Structure: Income sources (left) → "Income" hub node (center) → Expense categories (right). If net is positive, a "Savings" node appears on the right.

Features:
- Responsive via ResizeObserver
- Hover tooltips matching app style
- Top 10 categories per side, rest bucketed into "Everything else"
- Category name formatting (FOOD_AND_DRINK → "Food & Drink")

#### Page: `src/pages/CashFlowPage.jsx`

Layout at `/app/cash-flow` with controls:
- Period selector: segmented buttons [Week | Month | Quarter | Year]
- Breakdown toggle: segmented buttons [Category | Group | Merchant]
- Account filter: multi-select dropdown

#### Hook: `useCashFlowBreakdown` (`src/hooks/usePlaidQueries.js`)

Standard React Query hook, staleTime matches `STALE.charts`.

---

## Edge case handling

| Scenario | Summary card | Sankey diagram |
|----------|-------------|----------------|
| No income, expenses exist | $0 income, negative net (red), 0% savings | Expense-only with info banner |
| No expenses, income exists | Full income, $0 spent, 100% savings | Income-only with info banner |
| No data at all | All zeros | Full empty state with guidance message |
| Expenses > income | Negative savings rate (red) | Expense side wider than income — visually communicates overspending |
| >10 categories | N/A | Top 10 shown, rest bucketed into "Everything else" (gray) |

---

## Dependencies

- `d3-sankey` — Sankey layout algorithm
- `d3-shape` — `sankeyLinkHorizontal` path generator

---

# Agent & MCP — Cash Flow Enhancements

The Cash Flow UI now offers granular time-series, Sankey drill-downs, account filtering, custom date ranges, and savings rate. The agent and MCP tools lag behind — they expose a subset of what the UI can do. This plan closes those gaps so users get the same depth of insight via chat, Claude Desktop, or any MCP client.

## Gap summary

| # | What the UI can do | Agent | MCP | Backend exists? |
|---|---------------------|-------|-----|-----------------|
| 1 | Time-series with day/week/month granularity + custom date range | `get_cash_flow` only returns monthly buckets, no date params | Same | Yes — `getCashFlowTimeSeries` |
| 2 | Drill into a Sankey node to see matching transactions | No tool | No tool | Yes — `getCashFlowNodeTransactions` |
| 3 | Filter cash flow by account | No param | No param | Yes — `getCashFlowBreakdown` accepts `account_ids`, `getCashFlowTimeSeries` does not yet but query is simple |
| 4 | Custom date ranges on breakdown | Only preset periods (week/month/quarter/year) | Same | Partially — `cashFlowDateRange` maps presets; `getCashFlowBreakdown` could accept `start_date`/`end_date` |
| 5 | Savings rate as a first-class metric | Returned by `get_cash_flow_breakdown` already | Same | Yes |

## Implementation plan

### Phase 1 — Wire existing backend into agent & MCP (low effort, high value)

#### 1a. New tool: `get_cash_flow_time_series`

Expose `getCashFlowTimeSeries` as a new tool in both the spending agent and MCP server.

**Parameters:**
- `start_date` (string, YYYY-MM-DD, required) — beginning of range
- `end_date` (string, YYYY-MM-DD, required) — end of range
- `granularity` (enum: day | week | month, optional, default: month)

**Returns:** `{ start_date, end_date, granularity, buckets: [{ bucket, inflows, outflows, net }] }`

**Files to change:**
- `server/agent/queries.js` — add `getAgentCashFlowTimeSeries` wrapper around `getCashFlowTimeSeries`
- `server/agent/agents/spendingAgent.js` — add tool definition to `TOOLS`, handle in `executeTool`, update `SYSTEM_PROMPT` tool docs
- `server/mcp/server.js` — add `get_cash_flow_time_series` tool with zod schema, import new query function

**Agent prompt guidance:** Use this tool when the user asks about cash flow for a specific date range, daily/weekly trends, or wants finer granularity than monthly. Prefer over `get_cash_flow` when the user specifies dates or wants non-monthly buckets.

#### 1b. New tool: `get_cash_flow_node_transactions`

Expose `getCashFlowNodeTransactions` so the agent can drill into any category/merchant node.

**Parameters:**
- `period` (enum: week | month | quarter | year, required)
- `flow_type` (enum: income | expense, required)
- `category_key` (string, required) — the category/group/merchant name to drill into
- `breakdown` (enum: category | group | merchant, optional, default: category)

**Returns:** `{ transactions: [{ name, merchant_name, amount, date, account_name, category, ... }] }`

**Files to change:**
- `server/agent/queries.js` — add `getAgentCashFlowNodeTransactions` wrapper
- `server/agent/agents/spendingAgent.js` — add tool definition and handler
- `server/mcp/server.js` — add MCP tool

**Agent prompt guidance:** Use this after `get_cash_flow_breakdown` when the user wants to see the individual transactions behind a category. Example: user asks "what's in my Food & Drink spending?" → call `get_cash_flow_breakdown` first, then drill into the node.

#### 1c. Add `account_ids` param to existing cash flow tools

Add optional account filtering to `get_cash_flow_breakdown` and `get_cash_flow` in both agent and MCP.

**Parameters to add:**
- `account_ids` (array of strings, optional) — filter to specific accounts

**Files to change:**
- `server/agent/queries.js` — pass `accountIds` through to `getCashFlowBreakdown`; update `getAgentCashFlow` to accept and pass `accountIds` to `getMonthlyCashFlow` (requires adding account filter to that query)
- `server/agent/agents/spendingAgent.js` — add `account_ids` to tool schemas and `executeTool`
- `server/mcp/server.js` — add `account_ids` param to both tools' zod schemas
- `server/db.js` — add optional `accountIds` filter to `getMonthlyCashFlow` query (same pattern as `getCashFlowBreakdown`)

### Phase 2 — Custom date ranges on breakdown (medium effort)

#### 2a. Add `start_date` / `end_date` to `get_cash_flow_breakdown`

Currently the tool only accepts preset periods. Add optional custom date params.

**Behavior:** If `start_date` and `end_date` are provided, use them directly instead of computing from `period`. If only `period` is provided, keep current behavior.

**Files to change:**
- `server/db.js` — `getCashFlowBreakdown` to accept optional `customRange` parameter (same pattern as `getCashFlowNodeTransactions` already uses)
- `server/agent/queries.js` — update `getAgentCashFlowBreakdown` signature
- `server/agent/agents/spendingAgent.js` — add optional params to tool schema
- `server/mcp/server.js` — add optional params to zod schema

### Phase 3 — New capabilities (medium-high effort, high value)

#### 3a. New tool: `compare_cash_flow`

Period-over-period comparison that returns two periods side-by-side with deltas.

**Parameters:**
- `current_period` (object: `{ start_date, end_date }`)
- `previous_period` (object: `{ start_date, end_date }`)
- `breakdown` (enum: category | group | merchant, optional)

**Returns:**
```json
{
  "current": { "income": 8500, "expenses": 6200, "net": 2300, "savings_rate": 27.06 },
  "previous": { "income": 8000, "expenses": 7100, "net": 900, "savings_rate": 11.25 },
  "delta": { "income": 500, "expenses": -900, "net": 1400, "savings_rate": 15.81 },
  "category_changes": [
    { "name": "Food & Drink", "current": 850, "previous": 620, "delta": 230, "pct_change": 37.1 }
  ]
}
```

**Files to change:**
- `server/db.js` — new `getCashFlowComparison` function (calls `getCashFlowBreakdown` twice and computes deltas)
- `server/agent/queries.js` — `getAgentCashFlowComparison` wrapper
- `server/agent/agents/spendingAgent.js` — tool definition and handler
- `server/mcp/server.js` — MCP tool

**Agent prompt guidance:** Use when the user asks "how does this month compare to last month?", "am I spending more than usual?", or any period-over-period question. Always highlight the top 3 categories with the largest absolute change.

#### 3b. Add `get_recurring_transactions` to spending agent

The MCP already has this tool but the spending agent does not. Wire it in.

**Files to change:**
- `server/agent/agents/spendingAgent.js` — add tool definition calling Plaid's `transactionsRecurringGet` (extract shared logic from MCP into a reusable function in `server/lib/recurring.js`)
- `server/mcp/server.js` — refactor to import from shared module

## Execution order

```
Phase 1a  →  get_cash_flow_time_series (unblocks granular time questions)
Phase 1b  →  get_cash_flow_node_transactions (unblocks drill-down questions)
Phase 1c  →  account_ids on existing tools (unblocks per-account questions)
Phase 2a  →  custom dates on breakdown (unblocks arbitrary range questions)
Phase 3b  →  recurring in agent (trivial, just wiring)
Phase 3a  →  compare_cash_flow (biggest new capability)
```

Phases 1a–1c can be done in parallel — they touch different tools and have no dependencies on each other. Phase 2a depends on understanding the `getCashFlowBreakdown` changes from 1c. Phase 3 items are independent of each other.

## ✅ Completed: Natural language intent mapping

Everyday users don't say "get my cash flow breakdown" — they say "where is my money going?" or "am I saving enough?". Updated all three routing layers to handle informal phrasing:

1. **Orchestrator system prompt** (`server/agent/agents/orchestrator.js`) — replaced the generic ambiguity section with an explicit intent-mapping table that maps casual phrases to the right agent. Only asks for clarification when a question genuinely spans multiple domains.

2. **Spending agent** (`server/agent/agents/spendingAgent.js`):
   - Registration description now includes everyday phrases ("what's eating my paycheck?", "can I afford this?", etc.) so the orchestrator routes correctly
   - System prompt has a new "Understanding user intent" section with a lookup table mapping casual questions → tools
   - Tool descriptions rewritten with natural-language trigger examples

3. **MCP tool descriptions** (`server/mcp/server.js`) — `get_cash_flow`, `get_cash_flow_breakdown`, and `get_spending_summary` descriptions now include everyday phrasing examples and clearer guidance on when to prefer one tool over another.
