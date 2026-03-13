# Akoya Integration Plan

## Purpose

Akoya is a financial data network built on the FDX (Financial Data Exchange) open standard. It provides read-only access to accounts and transactions at financial institutions that Plaid does not support — particularly credit unions, regional banks, and institutions owned by the major banks that built Akoya (Fidelity, JPMorgan, Wells Fargo, Bank of America, etc.).

Adding Akoya means users can connect accounts that would otherwise show "institution not supported" in Plaid Link. From a user perspective it looks the same: click Add Connection, pick their bank, log in, see their data. Under the hood, the connection uses a different protocol.

**Akoya is a complement to Plaid, not a replacement.** Both run side-by-side. The right provider is chosen based on which institutions the user's bank is available through.

---

## How Akoya Differs from Plaid

| | Plaid | Akoya |
|---|---|---|
| Authorization | Plaid-hosted Link widget (iframe/popup) | Standard OAuth 2.0 + PKCE redirect |
| Data format | Plaid proprietary JSON | FDX (Financial Data Exchange) standard |
| Token type | Persistent access token (no expiry) | OAuth access token + refresh token |
| Webhook | `SYNC_UPDATES_AVAILABLE` webhook | FDX event notifications (future) |
| Institution coverage | Broad (10,000+ US institutions) | Institutions that adopted FDX standard |
| Enrichment | logo_url, counterparties, merchant data | Less enrichment; basic FDX fields |
| Sandbox | Plaid Sandbox environment | Akoya Sandbox environment |

---

## Architecture Overview

```
User clicks "Add Connection"
        ↓
Connection type picker (existing Plaid OR Akoya institution?)
        ↓
┌──────────────────┐        ┌──────────────────────────────┐
│   Plaid flow     │        │   Akoya flow                 │
│  (unchanged)     │        │                              │
│  Plaid Link      │        │  1. Backend builds OAuth URL │
│  → public_token  │        │  2. User redirects to bank   │
│  → exchange      │        │  3. Bank redirects to /cb    │
│  → plaid_items   │        │  4. Backend exchanges code   │
└──────────────────┘        │  5. Store akoya_connections  │
                            └──────────────────────────────┘
                ↓ (both paths)
        Sync transactions → transactions table (source = 'akoya')
                ↓
  Spending charts, net worth, cash flow, AI agent — all unchanged
```

**Key principle:** All downstream features read from the same `transactions` table. Adding a `source` column ('plaid' | 'akoya') is the only schema change to that table. The normalization layer converts FDX format into the same row shape as Plaid transactions before writing.

---

## Database Changes

### 1. New table: `akoya_connections`

Analogous to `plaid_items`. One row per connected institution per user.

```sql
CREATE TABLE akoya_connections (
  id                SERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  connector_id      TEXT NOT NULL,        -- Akoya's institution identifier
  institution_name  TEXT,
  access_token      TEXT NOT NULL,        -- OAuth access token (treat as secret)
  refresh_token     TEXT,                 -- OAuth refresh token (long-lived)
  token_expires_at  TIMESTAMPTZ,          -- When access token expires
  id_token          TEXT,                 -- OpenID Connect id_token
  scope             TEXT,                 -- Granted OAuth scopes
  accounts_cache    JSONB,               -- Last known accounts (fallback when API is slow)
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, connector_id)
);

CREATE INDEX ON akoya_connections (user_id);
```

### 2. Modify `transactions` table: add `source` column

```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plaid';

-- Index for fast filtering by source (useful for debugging/analytics)
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions (user_id, source);
```

All existing Plaid transactions default to `'plaid'`. Akoya transactions write `'akoya'`.

### 3. OAuth state table (PKCE + CSRF protection)

```sql
CREATE TABLE akoya_oauth_state (
  state         TEXT PRIMARY KEY,          -- random nonce, checked on callback
  user_id       TEXT NOT NULL,
  connector_id  TEXT NOT NULL,             -- institution the user was connecting
  code_verifier TEXT NOT NULL,             -- PKCE code verifier
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-expire: clean up states older than 10 minutes
CREATE INDEX ON akoya_oauth_state (created_at);
```

---

## OAuth 2.0 Flow (Step by Step)

### Initiate (frontend → backend → redirect)

```
POST /api/akoya/auth-url
Body: { connector_id: "chase" }
Auth: Bearer <Firebase token>

Response: { auth_url: "https://sandbox-api.akoya.com/auth/v1/authorize?..." }
```

Backend steps:
1. Verify Firebase token → `req.uid`
2. Generate `state` (random 32-byte hex) and `code_verifier` (PKCE, 64-byte random)
3. Compute `code_challenge = base64url(sha256(code_verifier))`
4. Store `{ state, user_id, connector_id, code_verifier }` in `akoya_oauth_state`
5. Build authorization URL:
   ```
   https://sandbox-api.akoya.com/auth/v1/authorize
     ?response_type=code
     &client_id=<AKOYA_CLIENT_ID>
     &redirect_uri=<AKOYA_REDIRECT_URI>
     &scope=openid offline_access accounts_basic transactions_read
     &connector_id=<connector_id>
     &state=<state>
     &code_challenge=<code_challenge>
     &code_challenge_method=S256
   ```
6. Return `{ auth_url }` to frontend

Frontend opens the URL (full-page redirect or popup). User logs into their bank, approves access, bank redirects to our callback URL.

### Callback (`GET /api/akoya/callback`)

```
GET /api/akoya/callback?code=<auth_code>&state=<state>
```

This is a **backend route** (no auth header — user is being redirected from the bank).

Backend steps:
1. Look up `state` in `akoya_oauth_state`; verify it exists and isn't expired (10 min max). Delete it.
2. Exchange `code` for tokens:
   ```
   POST https://sandbox-api.akoya.com/auth/v1/token
   Body: { grant_type: code, code, redirect_uri, client_id, code_verifier }
   ```
3. Receive `{ access_token, refresh_token, expires_in, id_token }`.
4. Upsert into `akoya_connections` with `user_id` from the state record.
5. Run initial transaction sync for all accounts.
6. Redirect browser back to the frontend dashboard: `302 → /app?akoya=connected`.

### Token refresh

Access tokens expire (typically 1 hour). Before any Akoya API call, check `token_expires_at`. If expired or within 5 minutes of expiry, call the token endpoint with `grant_type=refresh_token` and update the row.

```javascript
async function getValidAkoyaToken(connection) {
  const expiresAt = new Date(connection.token_expires_at)
  const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000
  if (!needsRefresh) return connection.access_token

  const refreshed = await akoyaTokenRefresh(connection.refresh_token)
  await updateAkoyaTokens(connection.id, refreshed)
  return refreshed.access_token
}
```

---

## Data Normalization (FDX → Our Schema)

Akoya returns data in FDX format. A normalization layer in `server/lib/akoyaNormalizer.js` converts FDX into the same shape as Plaid transactions before writing to the DB.

### FDX → transaction row mapping

| Our field | FDX source | Notes |
|---|---|---|
| `transaction_id` | `transactionId` | Use as `plaid_transaction_id` |
| `account_id` | `accountId` | |
| `name` | `description` or `merchantName` | Prefer merchantName if present |
| `amount` | `amount` | FDX positive = debit (same as Plaid) |
| `date` | `postedDate` | ISO date |
| `authorized_date` | `transactionDate` | Date transaction was initiated |
| `pending` | `status === 'PENDING'` | |
| `payment_channel` | `transactionType` | Map to 'in store' / 'online' / 'other' |
| `personal_finance_category` | `category[0]` | FDX category string |
| `merchant_name` | `merchantName` | |
| `original_description` | `description` | Raw description |
| `source` | hardcoded `'akoya'` | |

Fields with no FDX equivalent (`logo_url`, `counterparties`, `website`, `payment_meta`, `check_number`, `personal_finance_category_detailed`, `personal_finance_category_confidence`) will be `null` for Akoya transactions. The UI already handles null by showing `—`.

### Account mapping

| Our field | FDX source |
|---|---|
| `account_id` | `accountId` |
| `name` | `displayName` or `nickname` |
| `type` | `accountType` (mapped to plaid-style: 'depository', 'credit', 'investment', 'loan') |
| `subtype` | `accountSubtype` |
| `current` | `currentBalance` |
| `available` | `availableBalance` |
| `currency` | `currency` (default 'USD') |

---

## Backend Routes

New file: `server/routes/akoya.js`. Mounted in `server/index.js` at `/api/akoya`.

```
POST  /api/akoya/auth-url          Build OAuth URL for an institution (auth required)
GET   /api/akoya/callback          OAuth callback from bank (no auth — CSRF via state)
GET   /api/akoya/connections       List Akoya connections with live balances (auth required)
POST  /api/akoya/sync              Incremental transaction sync for a connection (auth required)
POST  /api/akoya/refresh           Full re-sync + balance refresh (auth required)
POST  /api/akoya/disconnect        Revoke token + delete from DB (auth required)
GET   /api/akoya/institutions      List institutions available via Akoya (auth required)
```

The callback route (`GET /api/akoya/callback`) is mounted **before** the auth middleware since the bank is redirecting the browser to it — no Firebase token is in play. Security is provided by the `state` + `code_verifier` PKCE check instead.

---

## Frontend Changes

### 1. "Add Connection" modal — two-step picker

The existing modal already has a two-button layout for connection type. The second step becomes:

- **Plaid** → existing flow (unchanged)
- **Akoya** → show institution picker, then redirect

When user picks Akoya:
1. Frontend calls `GET /api/akoya/institutions` to list available connectors.
2. User selects their institution from the list.
3. Frontend calls `POST /api/akoya/auth-url` with the `connector_id`.
4. Frontend does a full-page redirect to the returned `auth_url` (no popup — bank security requires a real redirect).

### 2. Callback landing

After the bank redirects back, the browser lands at `/app?akoya=connected` (success) or `/app?akoya=error` (failure). `LoggedInPage.jsx` reads the query param on mount:
- On `akoya=connected`: show a success toast, refetch connections and transactions.
- On `akoya=error`: show an error message.

### 3. Connections list

Akoya connections appear in the same connections list as Plaid connections. Each row shows institution name, status, last synced, and accounts with balances — same UI, different source. Add a small "Akoya" or "FDX" badge to the row so users can see which provider is behind each connection.

### 4. Refresh and Disconnect

Refresh and disconnect buttons work the same way — they POST to `/api/akoya/refresh` or `/api/akoya/disconnect` instead of the Plaid equivalents. The frontend passes a `source` flag (or the dashboard can detect which table the connection came from) to call the right endpoint.

---

## Environment Variables

```
AKOYA_CLIENT_ID=...
AKOYA_CLIENT_SECRET=...
AKOYA_REDIRECT_URI=https://yourapp.up.railway.app/api/akoya/callback
AKOYA_BASE_URL=https://sandbox-api.akoya.com   # switch to https://api.akoya.com for production
```

Add to `server/.env.example` with comments. Secret stored in Railway env on deploy — never committed.

---

## Security Notes

- `code_verifier` and `state` stored in DB and deleted on use — never in URL or frontend
- `access_token` and `refresh_token` stored server-side only, same as Plaid `access_token` — never sent to frontend
- All Akoya API calls are server-side only; frontend only sees normalized transaction rows from our DB
- State expires after 10 minutes; stale states are cleaned up
- OAuth callback verifies `state` before exchanging code — prevents CSRF
- `req.uid` is always used for DB writes — the `user_id` on `akoya_connections` comes from the `akoya_oauth_state` record tied to the original Firebase-authenticated request, never from the callback URL

---

## What Works Automatically (No Changes Needed)

Because Akoya transactions write into the same `transactions` table:

- ✅ Spending charts (reads `transactions` by user_id)
- ✅ Cash flow chart (reads `transactions` by user_id)
- ✅ AI spending assistant (queries `transactions` by user_id)
- ✅ Net worth chart (reads `transactions` for back-calculation)
- ✅ Transaction detail panel (same fields; Plaid-only enrichment shows `—`)
- ✅ Pagination and date filtering in transactions API
- ✅ `backfill-transaction-fields.js` script (loops `plaid_items` only — Akoya has its own sync)

---

## What Needs Updating

- `getSpendingSummaryByAccount`, `getMonthlyCashFlow`, and `getRecentTransactions` in `server/db.js` — currently filter by `item_id` for the connection filter pills. With Akoya, the connection filter needs to also accept Akoya connection IDs and filter by `account_id` or a new `connection_source_id` column. **Simplest fix:** add an optional `account_ids` array filter (already added for the spending drill-down) and have the frontend pass account IDs regardless of provider.
- `GET /api/plaid/connections` — currently returns only Plaid connections. The dashboard needs a unified connections endpoint or the frontend merges results from both `/api/plaid/connections` and `/api/akoya/connections`. A unified `GET /api/connections` endpoint is cleaner long-term.
- Connections filter pills in SpendingCharts — currently driven by `connections` (Plaid only). Update to include Akoya connections as additional pills.

---

## Milestones

---

### Milestone 1 — OAuth flow and account data

**Goal:** Users can connect an Akoya institution and see it in the connections list with live balances.

- [ ] Register with Akoya (sandbox credentials + approved redirect URI)
- [ ] Migration: `akoya_connections` table, `akoya_oauth_state` table, `source` column on `transactions`
- [ ] `server/routes/akoya.js`: `POST /auth-url`, `GET /callback`, `GET /connections`, `POST /disconnect`
- [ ] `server/lib/akoyaNormalizer.js`: FDX account → our schema
- [ ] Mount akoya router in `server/index.js` (callback route before auth middleware, others after)
- [ ] Frontend: add Akoya option to "Add Connection" modal with institution picker
- [ ] Frontend: handle `/app?akoya=connected` callback landing
- [ ] Frontend: show Akoya connections in connections list with "FDX" badge

**Result:** User can connect an Akoya institution and see accounts + balances.

---

### Milestone 2 — Transaction sync

**Goal:** Akoya transactions flow into the dashboard, charts, and AI assistant.

- [ ] `server/lib/akoyaNormalizer.js`: FDX transaction → our schema
- [ ] `server/routes/akoya.js`: transaction sync logic (fetch accounts → fetch transactions per account → normalize → upsert)
- [ ] `POST /api/akoya/sync` and `POST /api/akoya/refresh` routes
- [ ] Token refresh middleware (check expiry before every Akoya API call, refresh if needed)
- [ ] `GET /api/akoya/institutions` — serve cached provider list from Akoya Management API (cache on startup + daily refresh; see Institution Discovery section above)
- [ ] Frontend: Akoya connections appear in spending chart filter pills
- [ ] Frontend: Refresh and Disconnect buttons wired to Akoya routes

**Result:** Akoya transactions appear in recent transactions, spending charts, cash flow, and AI assistant alongside Plaid data.

---

### Milestone 3 — Unified connections layer

**Goal:** Clean up the seams between Plaid and Akoya so the frontend treats them uniformly.

- [ ] New endpoint `GET /api/connections` — merges Plaid + Akoya connections into one response with a `source` field per connection
- [ ] Frontend: dashboard `connections` state comes from the unified endpoint
- [ ] SpendingCharts filter pills driven by unified connections list
- [ ] `GET /api/plaid/spending-summary` and `getMonthlyCashFlow` — update to accept `account_ids` filter so Akoya-sourced accounts can be included/excluded in chart filtering (instead of Plaid `item_ids` only)
- [ ] Update `ONBOARDING.md` and `copilot_prd.md` to document Akoya

**Result:** No frontend distinction between Plaid and Akoya connections — one list, one filter, one experience.

---

## Files to Create or Modify

| Action | File | What changes |
|---|---|---|
| Create | `server/routes/akoya.js` | All Akoya API routes |
| Create | `server/lib/akoyaNormalizer.js` | FDX → our schema conversion |
| Create | `server/migrations/015_akoya.sql` | New tables + `source` column |
| Modify | `server/index.js` | Mount akoya router |
| Modify | `server/.env.example` | Document new env vars |
| Modify | `server/db.js` | `akoya_connections` CRUD functions |
| Modify | `src/pages/LoggedInPage.jsx` | Connection modal, callback handling |
| Modify | `src/components/SpendingCharts.jsx` | Akoya connections in filter pills |

---

## Institution Discovery

Akoya exposes available institutions through their **Management API**:

```
GET /manage/v2/recipients/{recipientId}/providers
  ?products=transactions
  &products=balances
  &products=accounts
```

This is a credentialed server-side call (using your Akoya recipient credentials, not a user token). It returns the list of institutions that support the specific products you've subscribed to, with pagination via `offset` and `limit`.

**Known `products` values** (confirm exact strings against your sandbox credentials):

| Value | What it gates |
|---|---|
| `transactions` | Transaction history |
| `balances` | Account balances |
| `accounts` | Account info/metadata |
| `investments` | Investment holdings |
| `customers` | Customer identity |
| `payment-networks` | Payment network data |

For this app, request at minimum `transactions`, `balances`, and `accounts`.

**Implementation:**
- Call this endpoint **on server startup and on a daily schedule** (cron or a timed refresh). Do not call it per user request.
- Cache the results in Postgres or in-memory. Serve from `GET /api/akoya/institutions` which returns the cached list.
- Each provider object includes a `connector_id` — this is the value you embed in the OAuth authorization URL's `connector_id` parameter when a user selects that institution.
- Provider display names come directly from Akoya's response; no external name matching needed.
- Optional: if a user already has a given institution connected via Plaid, gray out or hide it in the Akoya picker to avoid duplicate connections.

---

## Open Questions

1. **Webhook support:** Akoya supports FDX event notifications but setup varies by connector. Start without webhooks; add polling-based refresh in M2. Evaluate webhook support in a later milestone.
2. **Unified connections endpoint:** Decide whether to build `GET /api/connections` in M3 or keep the two separate endpoints and merge on the frontend. Unified backend is cleaner.
3. **Re-auth:** When an Akoya refresh token expires (typically 90 days), the user needs to reconnect. Design the re-auth UX (same as Plaid's "Reconnect" button) before M2 ships.
4. **Production approval:** Akoya requires application review before production access. Start sandbox integration early so production approval isn't a blocker at launch.
