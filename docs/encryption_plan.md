# Encryption Plan: Application-Layer Data Protection

## Context
Users' financial data (transactions, balances, holdings) is stored in plaintext in Postgres on Railway. A developer with DB access can read everything and identify whose data is whose via Firebase UIDs. This change encrypts sensitive fields and replaces Firebase UIDs with opaque UUIDs so a dev with DB access sees only ciphertext tied to anonymous IDs.

## Outcome

**For users:** Nothing changes. The dashboard, spending charts, cash flow, investment portfolio, MCP tools, and AI agent all work exactly the same. No one will notice a difference.

**For privacy:** A developer who logs into the Railway database will see something like this:

| user_id | date | amount | merchant_name | category |
|---------|------|--------|---------------|----------|
| `d4e5f6a7-...` | 2026-03-15 | `aGVsbG8=:x9Kp2...:mN3q...` | `aGVsbG8=:bR7w2...:kP4r...` | `aGVsbG8=:yT8m3...:qW2x...` |

- The user ID is a random UUID with no connection to any Google account or real person
- Amounts, merchant names, categories, account names, balances, tickers — all unreadable ciphertext
- Dates are the only readable field (but meaningless without knowing whose dates they are)
- Even if a dev knows a user personally, they cannot find that user's data in the database

**What's protected against:**
- A developer browsing the database out of curiosity
- A database breach exposing readable financial data
- Identifying which rows belong to which real person
- Reading transaction details, balances, holdings, or account names

**What's NOT protected against:**
- Someone with access to both the database AND the encryption key (stored in Railway env vars) — they could decrypt everything. This is inherent to any app-layer encryption. True separation would require a cloud KMS (AWS/GCP), which is a future upgrade if needed.

## Privacy FAQ Page

### Step A: Create FAQ doc
**NEW: `docs/privacy_faq.md`** — User-facing FAQ covering: what data is stored, encryption details, employee access, Plaid connection, what's not encrypted (dates), breach scenario, AI/MCP access, data deletion.

### Step B: Add sidebar link
**MODIFY: `src/components/AppHeader.jsx`** — Add a "Privacy & Security" link near the logout button in the sidebar/nav, pointing to `/privacy-faq`.

### Step C: Add route
**MODIFY: `src/App.jsx`** — Add a `/privacy-faq` route rendering a new `PrivacyFaqPage` component.

### Step D: Create page component
**NEW: `src/pages/PrivacyFaqPage.jsx`** — Renders the FAQ content in the same style as the existing `PrivacyPolicyPage`.

---

## Encryption Scope

**Encrypted (everything except dates and Plaid IDs):**

| Table | Encrypted Fields |
|-------|-----------------|
| plaid_items | access_token, institution_name, accounts_cache, error_code, products_granted, sync_cursor |
| transactions | name, merchant_name, account_name, amount, original_description, logo_url, website, location (JSON), counterparties (JSON), payment_meta (JSON), check_number, recurring, personal_finance_category, personal_finance_category_detailed, personal_finance_category_confidence, payment_channel, pending |
| portfolio_snapshots | total_value, source, unavailable_items (JSON) |
| portfolio_account_snapshots | account_name, institution, value |
| holdings_snapshots | account_name, institution, security_name, ticker, security_type, quantity, price, value, cost_basis, currency, source |
| investment_transactions | institution, account_name, security_name, ticker, security_type, quantity, price, amount, fees, type, subtype, currency |
| account_balance_snapshots | account_name, institution_name, current, available, credit_limit, type, subtype, currency |
| securities | ticker, name, type, currency |
| cli_tokens | name |

**Stays plaintext (needed for SQL constraints and date filtering):**
- `date`, `authorized_date`, `created_at`, `last_synced_at`, `expires_at`
- All Plaid IDs: `item_id`, `account_id`, `plaid_transaction_id`, `security_id`
- `user_id` (opaque UUID — no link to real identity)
- `lot_index` (integer, needed for ON CONFLICT)

**What a dev sees in the DB:** "UUID abc123 had a [ciphertext] transaction on March 15" — no amount, no category, no merchant, no way to know who abc123 is.

## Query Strategy

With amounts and categories encrypted, SQL can only filter by `user_id` and `date`. All aggregation queries become:
1. `SELECT * FROM table WHERE user_id = $1 AND date BETWEEN $2 AND $3`
2. Decrypt all fields in Node.js
3. Filter (category, amount sign, merchant search, etc.) in JS
4. Aggregate (SUM, GROUP BY, COUNT) in JS

## Implementation Steps

### Step 1: Create encryption module
**NEW: `server/lib/crypto.js`**
- AES-256-GCM, random IV per value, stored as `iv:ciphertext:authTag` (base64)
- `encrypt(plaintext)` / `decrypt(ciphertext)` — returns null for null input
- `encryptNum(n)` / `decryptNum(s)` — for numeric fields (string conversion)
- `encryptJSON(obj)` / `decryptJSON(s)` — for JSON columns
- `encryptBool(b)` / `decryptBool(s)` — for boolean fields
- `hashFirebaseUid(uid)` — SHA-256 with ENCRYPTION_KEY as salt
- Key derived from `ENCRYPTION_KEY` env var

### Step 2: Create users table
**NEW: `server/migrations/023_users_table.sql`**
- `id` (UUID, primary key) — the opaque internal ID
- `firebase_uid_hash` (TEXT, unique, indexed) — for lookup
- `firebase_uid_encrypted` (TEXT) — for recovery/debugging

### Step 3: Add user ID mapping to auth
**MODIFY: `server/db.js`** — add `resolveUserId(firebaseUid)`:
- Hash Firebase UID → look up in users table → return opaque UUID
- Auto-create on first login

**MODIFY: `server/middleware/auth.js`** — after verifying Firebase token, call `resolveUserId()` so `req.uid` becomes opaque UUID

**MODIFY: `server/routes/cliAuth.js`** — use `resolveUserId()` in token exchange and revoke flows

### Step 4: Add encrypt-on-write to db.js
Every write function encrypts sensitive fields before INSERT/UPDATE. Functions to modify:
1. `upsertPlaidItem` — encrypt access_token, institution_name, products_granted
2. `updateAccountsCache` — encryptJSON
3. `setItemErrorCode` — encrypt error_code
4. `updateSyncCursor` — encrypt sync_cursor
5. `upsertTransactions` — encrypt name, amount, merchant_name, account_name, personal_finance_category, personal_finance_category_detailed, personal_finance_category_confidence, payment_channel, pending, logo_url, original_description, website, location, counterparties, payment_meta, check_number, recurring
6. `updateTransactionAccountNames` — encrypt account_name, remove IS DISTINCT FROM guard
7. `updateTransactionCategory` — encrypt category fields
8. `updateTransactionRecurring` — encrypt recurring
9. `upsertPortfolioSnapshot` — encrypt total_value, source, unavailable_items
10. `upsertPortfolioAccountSnapshot` — encrypt account_name, institution, value
11. `upsertHoldingSnapshot` — encrypt account_name, institution, security_name, ticker, security_type, quantity, price, value, cost_basis, currency, source
12. `upsertSecurity` — encrypt ticker, name, type, currency
13. `upsertInvestmentTransactions` — encrypt institution, account_name, security_name, ticker, security_type, quantity, price, amount, fees, type, subtype, currency
14. `upsertAccountBalanceSnapshot` — encrypt account_name, institution_name, current, available, credit_limit, type, subtype, currency
15. `createCliToken` — encrypt name
16. `insertBackfillPortfolioSnapshot` — encrypt source

### Step 5: Add decrypt-on-read to db.js
Every read function decrypts sensitive fields after SELECT. Helper: `decryptRow(row, encryptedFieldNames)` / `decryptRows(rows, encryptedFieldNames)`.

Simple reads (~20 functions) — just decrypt after SELECT:
- `getPlaidItemByItemId`, `getPlaidItemsByUserId`, `getPlaidItemByInstitutionId`
- `getRecentTransactions`, `getTransactionAccounts`, `getSubscriptionPayments`, `getLogoUrlsByPlaidTransactionIds`
- `getPortfolioHistory`, `getHoldingsSnapshotForDate`, `getLatestHoldingsSnapshot`, `getInvestmentAccounts`
- `getInvestmentTransactionsByAccount`, `getInvestmentTransactionsByTicker`
- `getAccountBalanceHistory`, `getLatestAccountBalances`, `getLatestInvestmentAccountBalances`
- `getLatestPortfolioValue`, `deletePlaidItem` (RETURNING clause)

### Step 6: Rewrite aggregation functions to JS
These currently do SQL aggregation on encrypted columns — must move to fetch-decrypt-aggregate-in-JS:

1. **`getSpendingSummaryByAccount`** — currently `SUM(amount) GROUP BY category, account_name`. Rewrite: fetch all transactions in date range, decrypt, group/sum in JS.
2. **`getMonthlySpendingByAccount`** — currently `SUM(amount) GROUP BY month`. Rewrite: fetch, decrypt, group by month in JS.
3. **`getMonthlyCashFlow`** — currently `SUM(CASE WHEN amount < 0...)`. Rewrite: fetch, decrypt, separate inflows/outflows in JS.
4. **`getCashFlowTimeSeries`** — currently `GROUP BY date_trunc(bucket)`. Rewrite: fetch, decrypt, bucket in JS.
5. **`getCashFlowBreakdown`** — currently `GROUP BY category` with Venmo override via JOIN. Rewrite: fetch transactions + plaid_items, decrypt both, apply Venmo logic + grouping in JS.
6. **`getCashFlowNodeTransactions`** — currently filters by category/amount sign in SQL. Rewrite: fetch by date range, decrypt, filter in JS.
7. **`getCashFlowTransactions`** — similar to above.
8. **`getTransactionsForNetWorth`** — currently `SELECT amount WHERE date >=`. Rewrite: fetch, decrypt amounts in JS.
9. **`getTransactionCategories`** — currently `SELECT DISTINCT category`. Rewrite: fetch, decrypt, dedupe in JS.

### Step 7: Fix special SQL patterns
- **`getRecentTransactions` ILIKE search**: Remove SQL `ILIKE` on merchant_name/name. Fetch by user+date, decrypt, filter by search term in JS, apply LIMIT/OFFSET in JS.
- **`updateTransactionAccountNames`**: Remove `IS DISTINCT FROM` comparison (can't compare ciphertext). Always update.
- **`getSubscriptionPayments`**: `WHERE personal_finance_category = 'SUBSCRIPTION'` breaks. Rewrite: fetch all transactions with `recurring IS NOT NULL`, decrypt, filter by category in JS.

### Step 8: Modify agent queries
**MODIFY: `server/agent/queries.js`**
- `getAgentSpendingSummary` — does its own SQL with `SUM(amount) GROUP BY category`. Rewrite: fetch by user+date, decrypt, aggregate in JS.
- `getAgentTransactions` — does SQL with `WHERE category = ...`, `WHERE amount > 0`. Rewrite: fetch by user+date, decrypt, filter in JS.
- Other agent functions (`getAgentCashFlow`, `getAgentCashFlowBreakdown`, etc.) wrap db.js functions — if db.js handles decryption, these may need minimal changes. Verify each one.

### Step 9: One-time migration script
**NEW: `server/migrate-encrypt.js`**
1. Create user mappings (Firebase UID → opaque UUID) for all existing users
2. Update `user_id` in all tables from Firebase UID to opaque UUID
3. Encrypt all sensitive columns in-place (batch processing, per-table transactions)
4. Idempotent (detects already-encrypted values), supports `--dry-run`, logs progress

Tables to process: plaid_items, transactions, portfolio_snapshots, portfolio_account_snapshots, holdings_snapshots, investment_transactions, account_balance_snapshots, securities, cli_tokens

### Step 10: CLI decrypt tool
**NEW: `server/decrypt-tool.js`**
- `--table transactions --user <uuid> --limit 10` — decrypt and display rows
- `--raw "iv:ciphertext:tag"` — decrypt a single value
- `--lookup-firebase <uid>` — find opaque UUID for a Firebase UID

## Files Changed Summary

| File | Action |
|------|--------|
| `server/lib/crypto.js` | NEW — encryption module |
| `server/migrations/023_users_table.sql` | NEW — users table |
| `server/migrate-encrypt.js` | NEW — one-time data migration |
| `server/migrate-decrypt.js` | NEW — rollback migration |
| `server/decrypt-tool.js` | NEW — CLI debug tool |
| `server/db.js` | MODIFY — encrypt/decrypt at read/write boundary, rewrite ~9 aggregation functions to JS |
| `server/middleware/auth.js` | MODIFY — Firebase UID → opaque UUID mapping |
| `server/routes/cliAuth.js` | MODIFY — use resolveUserId in exchange/revoke |
| `server/agent/queries.js` | MODIFY — rewrite 2 functions that do their own SQL aggregation |
| `docs/privacy_faq.md` | NEW — user-facing privacy & security FAQ |
| `src/pages/PrivacyFaqPage.jsx` | NEW — FAQ page component |
| `src/components/AppHeader.jsx` | MODIFY — add Privacy & Security link near logout |
| `src/App.jsx` | MODIFY — add /privacy-faq route |

## What Doesn't Change
- **Frontend** — zero changes (beyond the new FAQ page)
- **MCP tools** — zero changes (db.js returns decrypted data)
- **Agent behavior** — zero changes (agent code receives decrypted data)
- **Plaid webhooks** — item_id lookup still works, user_id is opaque UUID
- **Cron jobs** — iterate opaque UUIDs, same logic

## Verification
1. Connect a Plaid item → encrypted in DB, correct in app
2. Transaction sync → new transactions encrypted
3. Agent chat → spending/cash flow/portfolio queries correct
4. MCP tools → all tools return correct data
5. Transaction search → JS filtering works
6. Cash flow Sankey → Venmo override works
7. CLI auth → token exchange works
8. DB inspection → only ciphertext + dates visible

## Backup & Rollback

The rollback strategy has two layers: **code rollback** (fast, easy) and **data rollback** (requires a script).

### Before we start: take a full DB backup
Before running the encryption migration, we dump the entire database to a file. This is the ultimate safety net — if everything goes wrong, we restore this backup and redeploy the old code.

```
pg_dump $DATABASE_URL > pre-encryption-backup.sql
```

Store this file securely (it contains plaintext data). Once encryption is stable, delete it.

### Scenario 1: Code is deployed but migration hasn't run yet
**Risk:** Zero. The new code handles both encrypted and plaintext data. If no data has been encrypted, everything works exactly as before.
**Rollback:** Just redeploy the previous commit. No data changes to undo.

### Scenario 2: Migration ran but something is broken
**Option A — Decrypt migration (preferred):**
We build `server/migrate-decrypt.js` alongside the encrypt script. It does the reverse:
1. For each table, read rows, decrypt all encrypted fields, write plaintext back
2. Restore Firebase UIDs from the `users` table (`firebase_uid_encrypted` → decrypt → update `user_id` columns back)
3. Then redeploy the old code

This is safe because we still have the `ENCRYPTION_KEY` and the `users` mapping table.

**Option B — Restore from backup (nuclear option):**
If the decrypt script itself has issues:
1. `psql $DATABASE_URL < pre-encryption-backup.sql` — restores the entire DB to pre-encryption state
2. Redeploy the previous commit
3. Everything is back to exactly where it started

### Scenario 3: App works but one specific feature is broken
Since encryption/decryption happens in `db.js`, we can selectively disable encryption for specific fields by temporarily passing them through without encrypting. This lets us fix one feature at a time without rolling back everything.

### What we build to support this
1. **`server/migrate-decrypt.js`** — reverse migration script, built at the same time as the encrypt script
2. **Pre-migration DB dump** — taken before running the encrypt migration
3. **Git branch** — all changes on a feature branch; main branch is untouched until verified

## Key Management
- `ENCRYPTION_KEY` in Railway env var + backed up in password manager
- If key is lost, all data is unrecoverable
- Key rotation: future script to re-encrypt with new key

## Generating the Encryption Key
Generate a secure 256-bit key using Node.js:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
This outputs a 64-character hex string. Add it to:
1. `server/.env` locally: `ENCRYPTION_KEY=<your key>`
2. Railway environment variables (same value)
3. Your password manager (backup copy)
