# Financial Agent — Plan

## Goal

A conversational financial advisor embedded in the app. Users open the chat panel, ask questions about their finances, and get intelligent answers grounded in their actual data. The agent only answers finance-related questions and never fabricates data it doesn't have access to.

---

## Architecture Overview

```
User types message
       ↓
ChatPanel (frontend)
       ↓
POST /api/agent/chat  (Express, Railway)
       ↓
Anthropic API  (claude-sonnet-4-6)
  + system prompt
  + conversation history
  + tool results (M2+)
       ↓
Assistant response
       ↓
ChatPanel renders message
```

The server is **stateless** — the frontend sends the full conversation history on every request. No session storage needed server-side.

---

## Mode Parameter

The ChatPanel toggle (Auto / Transactions / Investments / Accounts) is passed to the server as `mode`. It adjusts the system prompt focus:

| Mode | System prompt emphasis |
|---|---|
| Auto | Full financial advisor — uses whatever context is relevant |
| Transactions | Focus on spending, income, and transaction history |
| Investments | Focus on portfolio, holdings, and investment performance |
| Accounts | Focus on balances, net worth, and account overview |

In M1, mode only changes the system prompt. In M2, it also controls which tools are offered to the agent.

---

## Milestone 1 — End-to-end chat (no tools)

**Goal:** User sends a message, agent responds. Full round trip working. No data tools yet — agent answers from its own knowledge + whatever context the system prompt provides about the user.

### What gets built

**Backend:**

- New route: `POST /api/agent/chat`
  - Auth-protected (req.uid)
  - Body: `{ message: string, history: [{role, content}], mode: string }`
  - Calls Anthropic API with system prompt + history + new message
  - Returns `{ reply: string }`
- System prompt: establishes the agent as a personal financial advisor, instructs it to only answer finance-related questions, and tells it to say "I don't have access to that data yet" when asked something it can't answer without tools
- New file: `server/agent/chat.js` — isolated agent logic, imported by the route

**Frontend:**

- `ChatPanel` calls `POST /api/agent/chat` on send
- Loading state: animated dots (or "Thinking...") appear in the message thread while waiting
- Assistant response appended to thread on arrival
- Error state: if the request fails, show an inline error message in the thread
- History maintained in `messages` state and sent on every request

**Model:** `claude-sonnet-4-6` — fast, capable, good instruction-following

**Streaming:** Not in M1. Full response returned at once. Streaming can be added later if the latency feels too long.

### System prompt (M1)

```
You are a personal financial advisor assistant embedded in a finance dashboard app called Crumbs Money.

The user has linked their bank accounts, credit cards, and investment accounts via Plaid. You have access to their financial data through tools (coming soon). For now, answer general personal finance questions thoughtfully and honestly.

Rules:
- Only answer finance-related questions. If asked about anything else, politely redirect.
- Never fabricate specific numbers about the user's accounts. If you don't have the data, say so clearly.
- Be concise. Lead with the answer, then explain if needed.
- When the user asks about their specific data (spending, balances, transactions), tell them you'll be able to answer that once data tools are connected.
- Tone: direct, helpful, no jargon.
```

Mode-specific addendum appended to the base prompt based on `mode` value.

### API

```
POST /api/agent/chat
Auth: Bearer <Firebase ID token>

Request:
{
  "message": "How much did I spend last month?",
  "mode": "Auto",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! How can I help with your finances?" }
  ]
}

Response:
{
  "reply": "I don't have access to your transaction data yet, but once tools are connected I'll be able to answer that precisely."
}
```

### Files

- `server/agent/chat.js` — agent logic (system prompt, Anthropic call, mode handling)
- `server/routes/agent.js` — Express router, `POST /agent/chat`, auth middleware
- Mount in `server/index.js` at `/api/agent`
- `src/components/AppHeader.jsx` — wire ChatPanel to call the endpoint, add loading + error states

---

## Milestone 2 — Transaction analysis tools

**Goal:** Agent can query the user's actual transaction data to answer spending questions. "How much did I spend on food last month?" gets a real answer from the database.

### Tool design

Tools are defined server-side and passed to the Anthropic API as the `tools` array. The server executes tool calls and feeds results back in a loop until the agent stops calling tools and returns a final response.

#### Tool: `get_spending_summary`

```json
{
  "name": "get_spending_summary",
  "description": "Get total spending by category for a time period. Use this to answer questions about how much the user spent on food, travel, shopping, etc.",
  "input_schema": {
    "type": "object",
    "properties": {
      "period": { "type": "string", "enum": ["week", "month", "year"], "description": "Time period to summarize" },
      "category": { "type": "string", "description": "Optional: filter to a specific Plaid category (e.g. FOOD_AND_DRINK). Omit to get all categories." }
    },
    "required": ["period"]
  }
}
```

#### Tool: `get_recent_transactions`

```json
{
  "name": "get_recent_transactions",
  "description": "Fetch a list of recent transactions. Use this when the user asks about specific purchases, merchants, or wants to see what they've been spending on.",
  "input_schema": {
    "type": "object",
    "properties": {
      "limit": { "type": "number", "description": "Max number of transactions to return (default 20, max 50)" },
      "after_date": { "type": "string", "description": "ISO date string — only return transactions after this date" },
      "before_date": { "type": "string", "description": "ISO date string — only return transactions before this date" },
      "category": { "type": "string", "description": "Optional: filter to a Plaid category" }
    }
  }
}
```

#### Tool: `get_cash_flow`

```json
{
  "name": "get_cash_flow",
  "description": "Get monthly income vs spending for the past N months. Use this to answer questions about whether the user is saving money, their income trends, or month-over-month comparisons.",
  "input_schema": {
    "type": "object",
    "properties": {
      "months": { "type": "number", "description": "Number of months to look back (default 3, max 12)" }
    }
  }
}
```

#### Tool: `get_net_worth`

```json
{
  "name": "get_net_worth",
  "description": "Get the user's current net worth — total assets minus liabilities — and recent history.",
  "input_schema": {
    "type": "object",
    "properties": {
      "range": { "type": "string", "enum": ["1M", "3M", "YTD", "1Y", "ALL"] }
    }
  }
}
```

#### Tool: `get_portfolio_value`

```json
{
  "name": "get_portfolio_value",
  "description": "Get the user's current investment portfolio value and recent performance.",
  "input_schema": { "type": "object", "properties": {} }
}
```

### Tool execution loop

```
1. Send message + tools to Anthropic API
2. If response contains tool_use blocks:
   a. Execute each tool call against the DB (scoped to req.uid — never trust user-supplied IDs)
   b. Append tool_result blocks to the message thread
   c. Send updated thread back to Anthropic
   d. Repeat until no more tool calls
3. Return final text response to client
```

### Security

- All DB queries in tool handlers use `req.uid` from the verified Firebase token — never the user's own input
- Tool results are never sent directly to the client — only the final assistant text response is returned
- Max 5 tool call iterations per request to prevent runaway loops

### Files added in M2

- `server/agent/tools.js` — tool definitions + tool execution handlers (each calls existing db.js functions)
- Updates to `server/agent/chat.js` — add tool loop logic

---

## What the agent can answer after M2

| Question | Tool used |
|---|---|
| "How much did I spend on food last month?" | `get_spending_summary` |
| "What did I buy at Whole Foods?" | `get_recent_transactions` |
| "Am I saving money?" | `get_cash_flow` |
| "What's my net worth?" | `get_net_worth` |
| "How is my portfolio doing?" | `get_portfolio_value` |
| "What were my biggest expenses this year?" | `get_spending_summary` + `get_recent_transactions` |

---

---

## Investment data freshness — reactive refresh in the agent

Investment holdings are refreshed nightly by a cron job. But if the user asks the agent a portfolio question mid-day (or after days of inactivity), the cron data may be hours old. The agent should handle this reactively.

### How it works

When the agent is about to answer a portfolio question, it should:

1. Check the timestamp of the most recent `portfolio_snapshots` row for the user
2. If data is older than a staleness threshold (e.g. 4 hours), call `snapshotInvestments` before answering
3. Wait for the snapshot to complete, then query the fresh data
4. Answer the question with up-to-date numbers

This is a judgment call the agent is well-suited to make — it knows the question being asked, can check the age of the data, and can decide whether a refresh is worth the latency.

### Tool design (M3)

#### Tool: `refresh_investment_data`

```json
{
  "name": "refresh_investment_data",
  "description": "Fetches the latest investment holdings from Plaid and updates the database. Call this before answering portfolio questions if the data is more than a few hours old. This takes a few seconds to complete.",
  "input_schema": { "type": "object", "properties": {} }
}
```

The tool handler calls `snapshotInvestments(userId)` server-side and returns a short confirmation with the new snapshot timestamp. The agent then proceeds to call `get_portfolio_value` or similar tools with fresh data.

### When to refresh vs. use cached data

| Scenario | What the agent should do |
|---|---|
| Data is < 4 hours old | Answer from DB — no refresh needed |
| Data is 4–24 hours old | Refresh proactively before answering |
| Data is > 24 hours old | Refresh, and mention to the user that data was stale |
| Nightly cron already ran today | Usually no refresh needed |

The agent should not refresh for every message — only when it's about to use investment data and that data may be stale.

---

## Future milestones (not planned yet)

- **M3:** Investment tools — holdings breakdown, position-level queries, dividend income; reactive staleness refresh (see above)
- **M4:** Streaming responses — text streams in token by token instead of waiting for full response
- **M5:** Proactive insights — agent surfaces observations without being asked ("You spent 40% more on dining this month")
- **M6:** Multi-turn memory — summarize past conversations so context persists across sessions
