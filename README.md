# Abacus

A personal finance dashboard that connects to your banks and investment accounts via Plaid. You can see spending, net worth, and portfolio in one place. Stack: React, Express, Firebase Auth, Postgres.

**[Release notes](docs/release_notes.md)** — user-facing changes by ship date.

---

## Quick start (for engineers)

1. `npm install` and `cd server && npm install`
2. Copy `server/.env.example` to `server/.env`; set `DATABASE_URL`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, and Firebase credentials. Set root `.env` with `VITE_API_URL` and `VITE_FIREBASE_*`.
3. `node server/run-migration.js` to apply DB migrations.
4. **Dev:** Run `npm run dev` (frontend) and `cd server && npm run dev` (API). Production: `npm run build && npm run start`.

**New to the repo?** See **[docs/ONBOARDING.md](docs/ONBOARDING.md)** for full setup, architecture, API reference, and where to add features.

---

## Why this stack?

**Firebase Auth** — I wanted Google SSO without building auth from scratch. The backend just verifies the ID token and gets a `uid`; no session tables or password storage.

**Railway** — Deploy from GitHub with one click, Postgres included. I run the API and the built frontend as a single service so I don’t have to deal with CORS or multiple hosts. Fits free-tier / small-team use.

---

## How it’s built

One Express app serves both the API and the static Vite build. Same origin in prod = simpler auth, no CORS.

Plaid is the source of truth. We store access tokens, sync cursors, and an `accounts_cache` in Postgres so we can tolerate Plaid hiccups and avoid hammering their API. Account/balance data is cached in memory (5 min TTL) and we dedupe in-flight requests per item — so if three components ask for the same connection at once, we hit Plaid once. On failure we fall back to the DB cache or empty; we don’t blow up the request.

Transactions use Plaid’s cursor-based `transactionsSync` only (no legacy endpoint). We upsert/delete in our DB and persist the cursor so the next sync is incremental.

DB is Postgres with hand-written SQL in `server/db.js`; no ORM.

---

## Decisions

- **Plaid sync** — We sync on page load and when the user taps Refresh. Optionally, when `PLAID_WEBHOOK_URL` is set, Plaid sends `SYNC_UPDATES_AVAILABLE`; we verify the webhook signature (JWT + body SHA-256) and then run an incremental sync in the background so the next visit has fresher data. Balances use `accountsBalanceGet` (real-time) when available, with `accountsGet` fallback. No webhooks or “only if stale” logic. Simpler, but more API calls per visit. Fine for my use case.
- **Spending chart** — Filter by tapping the legend (no separate filter pills). Default is all accounts. Filter state doesn’t persist across sessions.
- **Investment portfolio** — If the holdings API returns empty (e.g. user hasn’t granted investment consent), we still show portfolio value and the chart using the balances API. You see something useful; per-holding breakdown shows up once they consent.
- **Plaid products** — New links request both `transactions` and `investments` up front. Existing connections have to be re-linked if they only gave transactions before.
- **Deploy** — Node 20+, and we use `npm install` (not `npm ci`) for the build so native deps (e.g. Tailwind) resolve correctly on Railway’s Linux env.
- **Config** — Startup logs the effective config (secrets masked) and a Cursor rule keeps `.env` / code in sync. Catches “why does it work on my machine” early.
- **Account names** — We prefer Plaid’s `official_name` over `name` so you see “Chase Sapphire” instead of “CREDIT CARD.” We backfill existing transactions’ `account_name` on each sync.
- **Firebase on Railway** — No file mount for the service account; we support a `FIREBASE_SERVICE_ACCOUNT` JSON string in env so the same code runs locally (file) and on Railway (env).

---

## Tradeoffs

- Optional Plaid webhooks reduce unnecessary refresh; when not set, we still sync on load and on user Refresh.
- Spending filter selection isn’t persisted.
- Investment holdings (positions, tickers) only show after consent; until then it’s balances + chart.
- Existing users need to re-link to get investment consent.
- Lockfile can differ by platform because of native deps.
- A bit of log noise at startup for config visibility.
- Extra DB writes on sync to backfill account names.
- On Railway you paste the Firebase JSON into env (or use a secret manager).

---

## Documentation

- **[docs/ONBOARDING.md](docs/ONBOARDING.md)** — Onboarding for new engineers (setup, architecture, API, conventions).
- **[docs/README.md](docs/README.md)** — Index of all project docs (PRD, deploy, policies, plans).
- **[docs/copilot_prd.md](docs/copilot_prd.md)** — Product requirements and feature list.

---

## Challenges

**Plaid rate limits** — Early on, the connections list, accounts, net worth, etc. were each firing their own Plaid calls and we hit rate limits. I added in-memory caching with a short TTL, request deduplication (one in-flight call per item), and a persisted `accounts_cache` in the DB as fallback. We also use cursor-based transaction sync so we only pull deltas; we use `accountsBalanceGet` for balances (with `accountsGet` fallback when needed) and optionally Plaid webhooks for proactive sync when `PLAID_WEBHOOK_URL` is set.

---

## Learnings

**Credit card payments and spending** — Paying your credit card is moving money, not new spending. Plaid usually categorizes the checking-side payment as `TRANSFER_OUT` and the card-side credit as `TRANSFER_IN`; sometimes the payment is `LOAN_PAYMENTS`. Our spending logic excludes those categories (`NON_SPENDING_CATEGORIES` in `server/db.js`), so credit card payments do not inflate spending. If a payment ever showed up in spending, we’d add that category to the exclude list.

---

# Abacus MCP

## What is Abacus MCP?

Abacus MCP is a [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants like Claude direct, read-only access to your personal financial data. Instead of copying and pasting bank statements or manually describing your finances, you can ask Claude natural language questions and get precise answers drawn from your actual accounts, transactions, and investments in real time.

Once connected, Claude can answer questions about your spending, net worth, portfolio performance, recurring bills, and cash flow — the same data powering the Abacus dashboard, available directly in your AI conversations.

All data access is scoped to your account and read-only. Nothing is ever written to your accounts.

---

## Example Use Cases

**Spending**
- "How much did I spend on food and dining last month?"
- "What are my top 5 spending categories this year?"
- "Show me every transaction over $200 in March"
- "How does my spending this month compare to last month?"
- "How much have I spent on Uber in the past 3 months?"

**Investments & Portfolio**
- "What stocks do I currently own and how much is each position worth?"
- "What is my largest holding?"
- "How is my portfolio allocated across asset classes?"
- "Show me my recent trades in my Fidelity account"
- "How much dividend income did I receive this year?"

**Net Worth**
- "What is my current net worth?"
- "How has my net worth changed over the past year?"
- "What's the breakdown between my investments, cash, and debt?"
- "Am I worth more or less than I was 6 months ago?"

**Complex Questions**
- "What is my savings rate over the past 6 months?"
- "How much do I owe in total across all my credit cards and loans?"
- "What subscriptions am I paying for that I might want to cancel?"
- "If I'm spending at this pace, how long until I hit $100k saved?"
- "What are my biggest recurring expenses and are any unusually high this month?"

---

## Getting Started

### Prerequisites

1. **An Abacus account** — Sign up at [abacus-money.com](https://getabacus.xyz) using Google sign-in.
2. **Linked accounts** — Connect at least one bank, credit card, or investment account via Plaid from the dashboard. This is required before any MCP tools will return data.

### Connect via Claude.ai (web or mobile)

1. In Claude.ai, go to **Settings → Integrations → Add custom integration**
2. Enter the MCP server URL: `https://getabacus.xyz/mcp`
3. Claude will redirect you to sign in with Google — use the same account as your Abacus account
4. Once authorized, your financial tools will be available in any Claude.ai conversation

### Connect via Claude Desktop

1. Install [Claude Desktop](https://claude.ai/download)
2. Install the MCP bridge: `npm install -g mcp-remote`
3. Get your access token by running `copilot login` (CLI) or from your Abacus account settings
4. Edit your Claude Desktop config at `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "abacus": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://getabacus.xyz/mcp",
        "--header",
        "Authorization:Bearer YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

5. Restart Claude Desktop — a hammer icon will appear in the chat input confirming the tools are loaded

---

## Available Tools

The MCP server (mounted at `/mcp`) exposes financial data as tools for Claude Desktop, Claude.ai, and the CLI. All tools are read-only and scoped to the authenticated user.

| Tool Name | Description | Data Used |
|---|---|---|
| `get_started` | Returns a guide explaining what financial data is available and example questions to ask. Triggered when a user asks "what can you do?" or seems unsure where to start. | Static — no DB call |
| `get_accounts` | Returns current balances for all linked accounts — checking, savings, credit cards, loans, and investment accounts. | `account_balances` table (DB snapshot) |
| `get_net_worth` | Returns current net worth as a single number: investment portfolio value + liquid assets − liabilities. | `account_balances` + `portfolio_snapshots` tables |
| `get_net_worth_history` | Returns daily investment portfolio value over time, up to 5 years back. Used for charting wealth trends. | `portfolio_history` table |
| `get_spending_summary` | Returns total spending broken down by category for any date range. Income, transfers, and credit card payments are automatically excluded. | `transactions` table |
| `get_transactions` | Returns individual transactions for a date range with optional category filter. No row cap — bounded by date range. | `transactions` table |
| `get_cash_flow` | Returns monthly inflows (income), outflows (spending), and net for each month. | `transactions` table |
| `get_recurring_transactions` | Returns upcoming recurring bills and subscriptions detected by Plaid (Netflix, rent, utilities, etc.). | Live Plaid API (`transactionsRecurringGet`) |
| `get_portfolio` | Returns current investment holdings across all linked brokerage, IRA, and 401k accounts — tickers, quantities, prices, values, cost basis. | `holdings` table |
| `get_investment_transactions` | Returns trade history for a specific investment account — buys, sells, dividends, fees. Requires an `account_id` from `get_accounts`. | `investment_transactions` table |
| `ask_question` | Delegates to the full AI orchestrator for complex multi-step questions that require combining multiple data sources. | All of the above |

---

## More Notes:
* required me learning more about the Plaid API, I had to do research to know what functionality it had like recurring transactions + its limitations. 
** I also ran into a data freshness issue where we were pulling from endpoints that didnt have as current data as other endpoints. I also wasn't using webhooks in the beginning that I didn't realize Plaid supported, which basically tells us when to update the dashboard proactively so users dont need to keep autorefreshing unecessarily