# Onboarding: Crumbs Money (CoPilot)

**For:** New software engineers joining the team.  
**Goal:** Get full context so you can run the app, navigate the codebase, and ship changes confidently.

**Start here:** [copilot_prd.md](copilot_prd.md) — product requirements and decisions.  
**User-facing changes:** [release_notes.md](release_notes.md).

---

## 1. What this app is

- **Product:** Personal finance dashboard. Users sign in with Google, link bank/card/investment accounts via Plaid (read-only), and see balances, transactions, spending charts, net worth, cash flow, upcoming payments, and investment portfolio in one place.
- **Principles:** Read-only money data only (no moving money). Identity from Firebase only; every API and DB operation is scoped by the verified user.

---

## 2. Repo layout

```
copilotV2/
├── server/                 # Backend: Express API + Plaid + Postgres
│   ├── index.js             # Entry: CORS, auth, routes, static serve
│   ├── db.js                # All Postgres: plaid_items, transactions, queries
│   ├── middleware/auth.js   # Firebase ID token verification → req.uid
│   ├── routes/plaid.js      # All /api/plaid/* routes + webhook handler
│   ├── run-migration.js     # Runs server/migrations/*.sql in order
│   ├── migrations/          # 001_*.sql, 002_*.sql, … (run once per env)
│   └── .env                 # PLAID_*, DATABASE_URL, FIREBASE_*, etc. (not committed)
├── src/                     # Frontend: React + Vite
│   ├── main.jsx
│   ├── App.jsx              # Routes, AuthProvider, ProtectedRoute
│   ├── context/AuthContext.jsx
│   ├── lib/api.js           # apiFetch(path, { getToken }) — used everywhere
│   ├── lib/firebase.js
│   ├── pages/               # LoggedInPage, TransactionsPage, AccountsPage, InvestmentsPage, etc.
│   └── components/          # AppHeader, SpendingCharts, NetWorthChart, CashFlowChart, etc.
├── docs/                    # PRD, onboarding, deploy, policies, release notes
├── package.json             # Root: Vite, React, scripts (dev, build, start)
├── vite.config.js           # HTTPS in dev, dual HTML entry (landing vs app)
├── logged-out-landing-page.html
└── index.html               # SPA entry for /app/*
```

---

## 3. How to run

**Prerequisites:** Node 20+, Postgres (local or Railway), Plaid sandbox keys, Firebase project with Google sign-in.

### 3.1 Clone and install

```bash
cd copilotV2
npm install
cd server && npm install && cd ..
```

### 3.2 Environment

- **Backend:** Copy `server/.env.example` to `server/.env`. Set at least:
  - `DATABASE_URL` — Postgres connection string
  - `PLAID_CLIENT_ID`, `PLAID_SECRET` — from dashboard.plaid.com (Sandbox for dev)
  - `FIREBASE_SERVICE_ACCOUNT_PATH` — path to Firebase service account JSON (or `FIREBASE_SERVICE_ACCOUNT` as JSON string for Railway)
- **Frontend:** Root `.env` or `.env.local` with `VITE_API_URL=http://localhost:3001` and `VITE_FIREBASE_*` from Firebase Console.

### 3.3 Database

```bash
node server/run-migration.js
```

Runs all `server/migrations/*.sql` in order. Safe to re-run (migrations are idempotent or guarded).

### 3.4 Turn on the app (local development)

You need **two terminals** running at the same time: one for the frontend, one for the backend.

1. **Terminal 1 — Backend (API)**  
   From the repo root:
   ```bash
   cd server && npm run dev
   ```
   Leave it running. You should see something like `Server listening on http://localhost:3001`. The backend serves the API and (in production) the built frontend; in dev we run the frontend separately.

2. **Terminal 2 — Frontend (React)**  
   Open a second terminal, from the repo root:
   ```bash
   npm run dev
   ```
   Leave it running. Vite will print a local URL, usually **https://localhost:5173** (HTTPS in dev).

3. **Open the app**  
   In your browser, go to **https://localhost:5173**. You should see the logged-out landing page (“Your money. Simply Organized.”). Click “Continue with Google” to sign in; you’ll be redirected to the dashboard at `/app`.  
   If the app can’t load data, check that `VITE_API_URL` is set to `http://localhost:3001` so the frontend talks to the backend in Terminal 1.

4. **Stopping**  
   Stop the frontend with `Ctrl+C` in Terminal 2, and the backend with `Ctrl+C` in Terminal 1.

### 3.5 Production build

```bash
npm run build
npm run start
```

Serves the built frontend and API from one process (e.g. on Railway). No need for two terminals.

---

## 4. Git & GitHub

- **Repository:** `https://github.com/davidfromkansas/personal-finance-agent.git`  
  The project folder may be named `copilotV2` (or similar) locally; the remote repo is **personal-finance-agent**.

- **Default branch:** `main`. All shared work goes here unless the team uses feature branches.

- **Pull latest changes** (before you start work or to get others’ updates):
  ```bash
  git pull origin main
  ```

- **Push your changes** (after commit):
  ```bash
  git push origin main
  ```
  If you don’t have push access, open a fork and submit a Pull Request to the main repo.

- **Check remote:** `git remote -v` should show `origin` pointing at the repo above. If you cloned from a fork, add the upstream repo as a second remote so you can pull from it:
  ```bash
  git remote add upstream https://github.com/davidfromkansas/personal-finance-agent.git
  git fetch upstream
  git merge upstream/main   # or: git pull upstream main
  ```

- **Typical workflow:** Pull → make changes → commit → push. Keep `main` in sync with the team so merges stay simple.

---

## 5. Architecture (high level)

| Layer        | Tech            | Notes |
|-------------|------------------|-------|
| **Frontend**| React, Vite      | Tailwind, React Router. Auth via Firebase; API calls use `apiFetch(..., { getToken })`. |
| **Auth**    | Firebase (Google)| Popup sign-in. Backend verifies ID token, sets `req.uid`. No session DB. |
| **API**     | Express (`server/`) | All authenticated routes under `/api/plaid` use `authMiddleware`. Webhook at `POST /api/plaid/webhook` has no auth (verified by Plaid signature). |
| **Database**| Postgres        | Hand-written SQL in `server/db.js`. Tables: `plaid_items`, `transactions`, etc. Migrations in `server/migrations/`. |
| **Bank data** | Plaid          | We store `access_token`, `sync_cursor`; use `transactionsSync`, `accountsBalanceGet`, webhooks. Optional `PLAID_WEBHOOK_URL` for proactive sync. |

**Data flow (typical):** User opens `/app` → frontend gets Firebase ID token → requests `GET /api/plaid/connections` with `Authorization: Bearer <token>` → backend verifies token → `req.uid` → DB and Plaid calls scoped by that user only.

---

## 6. Backend: key files and patterns

- **`server/index.js`**  
  - Loads `server/.env`, mounts CORS, **raw body** for `/api/plaid/webhook` (before `express.json()` so we can verify Plaid’s signature), then `express.json()`, then `authMiddleware` + `plaidRouter` under `/api/plaid`. Serves `dist/` (SPA + logged-out landing).

- **`server/db.js`**  
  - Single `query(text, params)` helper; all access via functions like `getPlaidItemsByUserId`, `upsertTransactions`, `getRecentTransactions`, `getSpendingSummaryByAccount`, `getMonthlyCashFlow`, etc. **All queries take `userId`** (from `req.uid`). No ORM.

- **`server/routes/plaid.js`**  
  - **Caching:** In-memory balance cache per item (5 min TTL), request deduplication, `accounts_cache` in DB as fallback. Uses `accountsBalanceGet` for freshest balances (with `accountsGet` fallback if balance limit).
  - **Webhook:** `plaidWebhookHandler` verifies Plaid JWT + body SHA-256; on `SYNC_UPDATES_AVAILABLE` triggers sync for that item. Mounted in `index.js` with `express.raw()`.
  - **Routes:** link-token, exchange-token, connections, transactions, recurring, cash-flow, spending-summary, sync, refresh, link-token/update, disconnect, investments, investment-history, net-worth-history, accounts. See PRD and code for query params/body.

- **`server/middleware/auth.js`**  
  - Reads `Authorization: Bearer <token>`, verifies with Firebase Admin, sets `req.uid`. Used by all `/api/plaid` routes except the webhook.

---

## 7. Frontend: key files and patterns

- **`src/App.jsx`** — Route definitions. `ProtectedRoute` redirects unauthenticated users to `/`. `LoggedOutOnly` redirects logged-in users to `/app`. `/privacy` and `/terms` are public.

- **`src/lib/api.js`** — `apiFetch(path, { method, body, getToken })`. `getToken` is typically `useAuth().getIdToken`. Prepends `VITE_API_URL`, adds `Authorization` when `getToken` is provided.

- **`src/context/AuthContext.jsx`** — Exposes `user`, `ready`, `getIdToken`, sign-in/sign-out. Wraps app in `App.jsx`.

- **`src/pages/LoggedInPage.jsx`** — Dashboard: Plaid Link (Add Connection), connections list by category, refresh/disconnect, SpendingCharts, NetWorthChart, InvestmentPortfolio, UpcomingPayments, CashFlowChart, Recent Transactions. Refetches connections/transactions after link/refresh/disconnect.

- **Charts and data:** `SpendingCharts`, `NetWorthChart`, `InvestmentPortfolio`, `CashFlowChart`, `UpcomingPayments` each call `apiFetch` with `getToken`; some use `forwardRef`/`useImperativeHandle` so the dashboard can trigger a refresh.

---

## 8. API quick reference (all require auth unless noted)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST   | `/api/plaid/webhook` | No (Plaid signature) | Plaid notifications; verify JWT + body hash, then sync on SYNC_UPDATES_AVAILABLE |
| POST   | `/api/plaid/link-token` | Yes | Create Plaid Link token (add connection) |
| POST   | `/api/plaid/exchange-token` | Yes | Exchange public_token, store item, run initial sync |
| GET    | `/api/plaid/connections` | Yes | List items with balances (accountsBalanceGet), status, last_synced_at |
| GET    | `/api/plaid/transactions` | Yes | Recent transactions (cursor pagination: beforeDate, afterDate, limit) |
| GET    | `/api/plaid/recurring` | Yes | Recurring streams (for upcoming payments) |
| GET    | `/api/plaid/cash-flow` | Yes | Monthly inflows/outflows/net |
| GET    | `/api/plaid/spending-summary` | Yes | Spending by period (week/month/year), optional item filter |
| POST   | `/api/plaid/sync` | Yes | Run transactionsSync for an item (e.g. after webhook) |
| POST   | `/api/plaid/refresh` | Yes | transactions/refresh then sync; invalidate caches |
| POST   | `/api/plaid/link-token/update` | Yes | Link token in update mode (reconnect) |
| POST   | `/api/plaid/disconnect` | Yes | Delete item from DB, call Plaid item/remove |
| GET    | `/api/plaid/investments` | Yes | Holdings from investmentsHoldingsGet |
| GET    | `/api/plaid/investment-history` | Yes | Historical investment account values (range param) |
| GET    | `/api/plaid/net-worth-history` | Yes | Assets/debts/net worth over time (range param) |
| GET    | `/api/plaid/accounts` | Yes | Flattened accounts with balances |

---

## 9. Migrations

- Live in `server/migrations/` as `001_plaid_items.sql`, `002_transactions.sql`, etc.
- Run once per environment: `node server/run-migration.js`. The runner applies files in order; already-applied migrations are typically guarded (e.g. `IF NOT EXISTS`).

---

## 10. Where to add or change things

- **New API route:** Add to `server/routes/plaid.js` (e.g. `plaidRouter.get('/my-route', ...)`). Use `req.uid` for all DB/Plaid. Invalidate caches in plaid.js if you change balance or sync state.
- **New DB query or table:** Add function or migration in `server/db.js` and `server/migrations/`. Always scope by `user_id` (from `req.uid`).
- **New dashboard widget:** Add component under `src/components/`, fetch via `apiFetch` with `getToken`, mount on `LoggedInPage.jsx` (or another page). Trigger refetch after link/refresh/disconnect if the widget depends on connections or transactions.
- **Auth or global API behavior:** `server/middleware/auth.js`, `src/context/AuthContext.jsx`, `src/lib/api.js`.
- **Product/feature decisions:** Update `docs/copilot_prd.md` and add a short changelog entry at the bottom. User-facing changes go in `docs/release_notes.md`.

---

## 11. Other docs

| Doc | Purpose |
|-----|---------|
| [copilot_prd.md](copilot_prd.md) | Product requirements, implemented features, backlog |
| [release_notes.md](release_notes.md) | User-facing changes by ship date |
| [STACK_EXPLAINED.md](STACK_EXPLAINED.md) | Plain-language stack overview |
| [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) | Railway deploy, env, Firebase authorized domains |
| [PLAID_TRANSACTIONS_PLAN.md](PLAID_TRANSACTIONS_PLAN.md) | Plaid flow, sync, API design |
| [DATA_ISOLATION.md](DATA_ISOLATION.md) | Why we always scope by verified identity |
| [GOOGLE_SSO_PLAN.md](GOOGLE_SSO_PLAN.md) | Firebase sign-in setup |
| Policy/security | INFORMATION_SECURITY_POLICY, DATA_DELETION_AND_RETENTION_POLICY, ACCESS_CONTROLS_POLICY |

---

## 12. Conventions

- **Identity:** Never trust `user_id` from client. Use `req.uid` from auth middleware only.
- **Plaid:** Use `transactionsSync` (cursor-based) for transactions. Use `accountsBalanceGet` for balances when possible. Optional webhook: set `PLAID_WEBHOOK_URL` and verify webhook requests with Plaid’s JWT + body hash.
- **Spending:** Exclude transfers and loan payments (`NON_SPENDING_CATEGORIES` in `server/db.js`) so credit card payments don’t inflate spending.
- **Config:** Backend logs effective config (secrets masked) at startup. Keep `server/.env` and `.env.example` in sync; document new vars in `.env.example`.

If something is missing or unclear, add it to this doc or the PRD and mention it in your PR.
