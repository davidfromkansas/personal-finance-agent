# Crumbs Money

A personal finance dashboard that connects to your banks and investment accounts via Plaid. You can see spending, net worth, and portfolio in one place. Stack: React, Express, Firebase Auth, Postgres.

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

- **Plaid sync** — Sync everything on every page load. No webhooks or “only if stale” logic. Simpler, but more API calls per visit. Fine for my use case.
- **Spending chart** — Filter by tapping the legend (no separate filter pills). Default is all accounts. Filter state doesn’t persist across sessions.
- **Investment portfolio** — If the holdings API returns empty (e.g. user hasn’t granted investment consent), we still show portfolio value and the chart using the balances API. You see something useful; per-holding breakdown shows up once they consent.
- **Plaid products** — New links request both `transactions` and `investments` up front. Existing connections have to be re-linked if they only gave transactions before.
- **Deploy** — Node 20+, and we use `npm install` (not `npm ci`) for the build so native deps (e.g. Tailwind) resolve correctly on Railway’s Linux env.
- **Config** — Startup logs the effective config (secrets masked) and a Cursor rule keeps `.env` / code in sync. Catches “why does it work on my machine” early.
- **Account names** — We prefer Plaid’s `official_name` over `name` so you see “Chase Sapphire” instead of “CREDIT CARD.” We backfill existing transactions’ `account_name` on each sync.
- **Firebase on Railway** — No file mount for the service account; we support a `FIREBASE_SERVICE_ACCOUNT` JSON string in env so the same code runs locally (file) and on Railway (env).

---

## Tradeoffs

- More Plaid calls per visit in exchange for no webhook/cron setup.
- Spending filter selection isn’t persisted.
- Investment holdings (positions, tickers) only show after consent; until then it’s balances + chart.
- Existing users need to re-link to get investment consent.
- Lockfile can differ by platform because of native deps.
- A bit of log noise at startup for config visibility.
- Extra DB writes on sync to backfill account names.
- On Railway you paste the Firebase JSON into env (or use a secret manager).

---

## Challenges

**Plaid rate limits** — Early on, the connections list, accounts, net worth, etc. were each firing their own Plaid calls and we hit rate limits. I added in-memory caching with a short TTL, request deduplication (one in-flight call per item), and a persisted `accounts_cache` in the DB as fallback. We also use cursor-based transaction sync so we only pull deltas, and we reuse one `accountsGet` per item for both balances and transaction enrichment instead of multiple endpoints. That got us under the limit.
