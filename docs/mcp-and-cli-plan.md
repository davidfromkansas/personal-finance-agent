# MCP Server Plan

## Context
The goal is to allow external AI apps (Claude Desktop, ChatGPT) and a personal CLI tool to query the user's financial data using the Model Context Protocol (MCP). The web app continues to use the existing REST API unchanged. The MCP server is a second read-only interface into the same Postgres DB, mounted on the existing Express server at `/mcp`. Multi-user from day one — each user authenticates via a browser redirect (Google sign-in), receives a long-lived CLI token, and all MCP/CLI requests are scoped to that user's data.

---

## Architecture

```
Claude Desktop / ChatGPT         CLI (copilot)
         │                            │
         └──────────┬─────────────────┘
                    ▼
          POST /mcp  (HTTP+SSE)
          Authorization: Bearer cli_...
                    │
             MCP Server (Express)
                    │
         ┌──────────┼──────────────┐
         ▼          ▼              ▼
   DB queries   DB queries    runChat()
   (spending)  (portfolio)  (orchestrator)
                    │
                Postgres
```

---

## Phase 1 — DB Migration: CLI Tokens

**New file:** `server/migrations/012_cli_tokens.sql`

```sql
CREATE TABLE IF NOT EXISTS cli_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  name        TEXT,                        -- e.g. "MacBook Pro", "Claude Desktop"
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS cli_tokens_user_idx ON cli_tokens (user_id);
```

**New functions in `server/db.js`:**
- `createCliToken(userId, tokenHash, name, expiresAt)` — insert row
- `getCliTokenByHash(tokenHash)` — returns `{ user_id, expires_at, id }` or null
- `touchCliToken(id)` — update `last_used_at = NOW()`

---

## Phase 2 — Auth Flow (Browser Redirect)

### New file: `server/routes/cliAuth.js`

**`GET /api/cli-auth/start?port=PORT`**
- Validates port is a number (1024–65535)
- Redirects to `/cli-auth.html?port=PORT` (served as static file)

**`POST /api/cli-auth/exchange`**
- Body: `{ firebaseIdToken, port, name? }`
- Verifies Firebase ID token → gets `userId`
- Generates a cryptographically random token: `cli_` + 48 random bytes (hex)
- Stores `SHA-256(token)` in `cli_tokens` with 1-year expiry
- Returns `{ token }` (plaintext, only time it's returned)

**Mount in `server/index.js`:** `app.use('/api/cli-auth', cliAuthRouter)` — no auth middleware (it IS the auth flow)

### New file: `public/cli-auth.html` (or served inline)

Simple page that:
1. Reads `?port=PORT` from URL
2. Triggers Google sign-in via Firebase (same JS SDK already used in the web app)
3. On success, calls `POST /api/cli-auth/exchange` with the Firebase ID token + port
4. On success, redirects to `http://localhost:PORT/callback?token=...`
5. Shows a "You're connected" success message

---

## Phase 3 — Auth Middleware Update

**File:** `server/middleware/auth.js`

Add a second verification branch before the existing Firebase check:

```js
// If token starts with "cli_", verify against DB
if (token.startsWith('cli_')) {
  const hash = sha256(token)
  const row = await getCliTokenByHash(hash)
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired CLI token' })
  }
  await touchCliToken(row.id)   // fire-and-forget
  req.uid = row.user_id
  return next()
}
// else: existing Firebase ID token path
```

---

## Phase 4 — MCP Server

**New file:** `server/mcp/server.js`

Uses `@modelcontextprotocol/sdk` with `SSEServerTransport`.

### Mounting on Express

In `server/index.js`, add two routes:
```js
app.get('/mcp', authMiddleware, mcpSseHandler)   // client connects, establishes SSE stream
app.post('/mcp', authMiddleware, mcpPostHandler)  // client sends tool calls
```

`authMiddleware` already sets `req.uid` — the MCP handler reads it per-request.

### MCP Tools (8 total)

All tools are read-only and scoped to `req.uid`.

| Tool | Parameters | DB function used |
|------|-----------|-----------------|
| `get_accounts` | none | `getLatestAccountBalances`, `getLatestInvestmentAccountBalances` |
| `get_net_worth` | none | `getLatestPortfolioValue`, `getLatestAccountBalances` |
| `get_spending_summary` | `period` (week\|month\|year), `account_ids?` | `getAgentSpendingSummary` in `agent/queries.js` |
| `get_transactions` | `after_date?`, `before_date?`, `category?`, `search?`, `limit?` | `getAgentTransactions` in `agent/queries.js` |
| `get_cash_flow` | `months_back?` (default 12) | `getAgentCashFlow` in `agent/queries.js` |
| `get_portfolio` | none | `getLatestHoldingsSnapshot` |
| `get_investment_transactions` | `account_id`, `limit?` | `getInvestmentTransactionsByAccount` |
| `ask_question` | `question` (string) | `runChat()` in `agent/chat.js` — collects full streamed response |

### Multi-user session handling

Each SSE connection is a separate `SSEServerTransport` instance. `req.uid` is captured in a closure when the connection is established and threaded into every tool call for that session.

### New dependency
```
npm install @modelcontextprotocol/sdk --workspace=server
```
(or in `server/package.json` directly)

---

## Phase 5 — CLI

**New directory:** `cli/`

### Files

**`cli/package.json`**
```json
{
  "name": "@copilot/cli",
  "bin": { "copilot": "./index.js" },
  "type": "module"
}
```

**`cli/config.js`** — reads/writes `~/.copilot/config.json`: `{ token, serverUrl }`

**`cli/auth.js`** — auth flow:
1. Pick a random available local port
2. Spin up a temporary Express/http server on that port
3. Open browser to `{serverUrl}/api/cli-auth/start?port={port}`
4. Wait for `GET /callback?token=...` on the local server (30s timeout)
5. Save token to `~/.copilot/config.json`
6. Print "Authenticated successfully"

**`cli/mcp-client.js`** — thin MCP client:
- Connects to `{serverUrl}/mcp` via HTTP+SSE
- Sends `Authorization: Bearer {token}` header
- Exposes `callTool(name, args)` and `askQuestion(question)` methods

**`cli/index.js`** — entry point:
```
copilot                        → interactive REPL (readline loop)
copilot "question"             → single question, print answer, exit
copilot login                  → force re-auth
copilot logout                 → delete ~/.copilot/config.json
```

Interactive REPL uses `readline` with a `> ` prompt. Both modes call `ask_question` tool and stream text to stdout.

---

## Phase 6 — CORS Update

`server/index.js` CORS config needs to allow MCP clients. Add:
- For development: allow localhost origins
- For Claude Desktop / ChatGPT: they send requests server-side (no browser CORS), so no change needed there

---

## Files Created / Modified

| File | Action |
|------|--------|
| `server/migrations/012_cli_tokens.sql` | Create |
| `server/db.js` | Add `createCliToken`, `getCliTokenByHash`, `touchCliToken` |
| `server/middleware/auth.js` | Add CLI token branch |
| `server/routes/cliAuth.js` | Create |
| `server/mcp/server.js` | Create |
| `server/index.js` | Mount `/mcp` and `/api/cli-auth` routes, add MCP dependency |
| `public/cli-auth.html` | Create (static page for browser auth flow) |
| `cli/index.js` | Create |
| `cli/auth.js` | Create |
| `cli/config.js` | Create |
| `cli/mcp-client.js` | Create |
| `cli/package.json` | Create |

---

## Verification

1. **Migration**: `node server/run-migration.js` — verify `cli_tokens` table created
2. **Auth flow**: run `copilot login`, browser opens, sign in with Google, terminal prints "Authenticated"
3. **Single question**: `copilot "how much did I spend last month?"` — prints answer
4. **REPL**: `copilot` — opens prompt, ask questions, `exit` to quit
5. **Claude Desktop**: add MCP server config pointing to `https://yourserver.railway.app/mcp` with Bearer token — verify tools appear
6. **Multi-user**: authenticate two different Google accounts, verify each only sees their own data
7. **Token expiry**: manually set `expires_at` to the past, verify 401 is returned
