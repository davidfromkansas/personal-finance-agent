# CoPilot PRD — Product Requirements & Decisions

**Purpose:** Single source of product requirements and decisions for the CoPilot app. Update this doc as we build so anyone can quickly understand how the whole app works.

**Related docs:** [README](README.md) · [Stack](STACK_EXPLAINED.md) · [Google SSO](GOOGLE_SSO_PLAN.md) · [Plaid plan](PLAID_TRANSACTIONS_PLAN.md) · [Data isolation](DATA_ISOLATION.md) · [Deploy checklist](DEPLOY_CHECKLIST.md)

---

## 1. Vision & scope

- **Product:** Personal finance view — link bank/card accounts (read-only), see balances and (later) transactions, eventually natural-language questions about spending.
- **Principles:** Read-only money data only (no moving money). One sign-in (Google), one-time bank link per institution (Plaid). Data scoped strictly by verified user identity.

---

## 2. Stack (summary)

| Layer        | Choice           | Notes                                      |
|-------------|------------------|--------------------------------------------|
| Frontend    | React + Vite     | Tailwind, React Router                     |
| Auth        | Firebase (Google)| Popup sign-in; ID token for backend API   |
| Backend     | Node + Express   | Under `/server`; CORS for frontend origin |
| Database    | Postgres         | Railway Postgres; migrations in `/server/migrations` |
| Bank data   | Plaid            | Transactions product; Sandbox → Production |
| Hosting     | Railway          | Frontend, backend, Postgres                |

See [STACK_EXPLAINED.md](STACK_EXPLAINED.md) for a plain-language overview.

---

## 3. Authentication

- **Flow:** Not logged in → show logged-out landing (`/`). User clicks “Continue with Google” → Firebase popup → on success, redirect to `/app`. Logged-in users hitting `/` redirect to `/app`.
- **Identity:** Firebase UID is the only user identifier we use for backend and DB. Frontend sends `Authorization: Bearer <id_token>` to the API; backend verifies with Firebase Admin and uses `req.uid` for all data access.
- **Token for API:** AuthContext exposes `getIdToken()`; frontend uses it in `apiFetch(..., { getToken: getIdToken })` so every API call is authenticated.

See [GOOGLE_SSO_PLAN.md](GOOGLE_SSO_PLAN.md) for setup and error handling.

---

## 4. Data isolation & security

- **Golden rule:** Identity comes from the **verified auth token**, never from URL/body/query. Every DB read/write and every Plaid call is scoped by `user_id` derived from that token.
- **Backend:** Auth middleware verifies Firebase ID token, sets `req.uid`. All Plaid and DB operations use `req.uid` only; no `user_id` from client for authorization.
- **Storage:** `plaid_items` and (future) `transactions` rows have `user_id`; all queries filter by it.

See [DATA_ISOLATION.md](DATA_ISOLATION.md) for the full rationale and checklist.

---

## 5. Plaid integration (read-only)

- **Goal:** Read-only transaction (and balance) data. No Transfer/Auth for moving money.
- **Flow:** User clicks “Add Connection” → backend creates **link_token** → frontend opens Plaid Link → user completes Link → frontend sends **public_token** → backend exchanges for **access_token** and **item_id**, stores in DB tied to `user_id`. Returning users see existing connections from DB; no Plaid Link again unless adding another institution or reconnecting after error.
- **Backend API (implemented):**
  - `POST /api/plaid/link-token` — create link token (auth required).
  - `POST /api/plaid/exchange-token` — body `{ public_token }`; exchange and upsert into `plaid_items`.
  - `GET /api/plaid/connections` — list items for user; for each item call Plaid **accounts/balance/get** (real-time balances) and return connections with `accounts` (name, type, subtype, current/available balance). Status `connected` or `error` per item.
  - **Webhooks (optional):** When `PLAID_WEBHOOK_URL` is set in env, Plaid can send `SYNC_UPDATES_AVAILABLE` to that URL. We verify the request using Plaid’s JWT (Plaid-Verification header) and SHA-256 of the raw body; only then do we run an incremental transaction sync for the affected item. This keeps data fresher without the user having to tap Refresh.
  - **Refresh:** When the user taps Refresh we call Plaid `transactions/refresh` then run our incremental sync and invalidate balance caches.
- **Database:** Table `plaid_items` (`user_id`, `item_id`, `access_token`, `institution_name`, `last_synced_at`, `sync_cursor`, `accounts_cache`). Table `transactions` stores synced transactions. Balances are fetched live via `accountsBalanceGet` (cached in memory 5 min and in `accounts_cache` on failure).

See [PLAID_TRANSACTIONS_PLAN.md](PLAID_TRANSACTIONS_PLAN.md) for full flow, API design, and future transactions/disconnect/refresh.

---

## 6. Implemented features

### 6.1 Logged-out experience

- **Page:** `/` (logged-out landing).
- **Content:** Headline “Your money. Simply Organized. All in one place.”, “Continue with Google” button. Light gray background (#f8f8f8), Roboto (or project font). Design from Figma.
- **Behavior:** Click “Continue with Google” → Firebase `signInWithPopup` → on success navigate to `/app`. On error, show user-friendly message (e.g. popup closed, popup blocked).

### 6.2 Logged-in experience

- **Page:** `/app` (protected; unauthenticated users redirect to `/`).
- **Header:** Hamburger (placeholder), Logout button. Logout calls Firebase `signOut` and navigates to `/`.

### 6.3 Plaid Connections module

- **Location:** Main content on `/app`; card layout per Figma (node 1-1944).
- **Card:** Title “Plaid Connections”, subtitle “Manage your linked financial institutions”, “Add Connection” button (opens Plaid Link when backend returns link_token).
- **Add Connection flow:** Frontend requests link-token (with auth) → opens Plaid Link → onSuccess sends public_token to exchange-token → on success refetches connections and shows new row(s). Errors (link-token fail, exchange fail) shown in UI.
- **Connections list:** Fetched from `GET /api/plaid/connections` on load. Each connection has `institution_name`, `status`, `last_synced_at`, and `accounts` (with balance). Empty state when no connections.

### 6.4 Plaid Connections — categorization & display (product decisions)

- **Four categories (design):** Credit, Deposits, Investments, Other. Connections are **automatically** grouped into these from Plaid account types.
- **Mapping (Plaid → category):**
  - **Credit:** Plaid types `credit`, `loan`.
  - **Deposits:** Plaid type `depository`.
  - **Investments:** Plaid type `investment`.
  - **Other:** Plaid type `other` (or unknown).
- **Split by account type:** A single connection (institution) can appear in **multiple** categories if it has accounts of different types (e.g. Chase in Deposits and in Investments).
- **One row per account:** Within each category, we show **one row per account**, not one row per connection. So 3 depository accounts at one bank → 3 rows under Deposits (same institution name, each row shows that account’s summary and balance). Same for multiple credit/investment/other accounts.
- **Section headers:** Each category has a header with icon (credit card, landmark, trending up, folder), category name, and count of rows in that category.
- **Row content:** Institution name, Connected/Error pill, account-type summary (e.g. “Checking • 1 account”), optional balance line, “Last synced …”. Refresh and Remove buttons (Remove disconnects the full connection; see 6.6).

### 6.5 Backend & DB (milestone 1)

- **Server:** Express in `/server`; dotenv loaded from `server/.env` (path relative to server so it works from any cwd). Firebase Admin verifies ID token; auth middleware sets `req.uid`. Plaid client uses Sandbox; lazy DB pool so `DATABASE_URL` is read after env load.
- **Migration:** `server/migrations/001_plaid_items.sql` creates `plaid_items`. Run once (e.g. `node server/run-migration.js` or `psql $DATABASE_URL -f server/migrations/001_plaid_items.sql`).
- **Env:** `server/.env` has `PLAID_CLIENT_ID`, `PLAID_SECRET`, `DATABASE_URL` (public Railway URL for local dev), `FIREBASE_SERVICE_ACCOUNT_PATH`. Root `.env` has `VITE_API_URL` for frontend.

### 6.6 Disconnect a connection

- **Backend:** `POST /api/plaid/disconnect` — body `{ item_id }`. Auth required. Deletes the row from `plaid_items` for that user and item. Then calls Plaid `/item/remove` to revoke the access token (best-effort; if Plaid call fails the row is already deleted). Returns `{ success: true }` or 404 if the connection wasn't found.
- **Frontend:** Trash button on each connection row calls `handleDisconnect(connection)`. Shows a confirmation dialog ("Disconnect [institution]? This will remove all linked accounts."). On confirm, POSTs to `/api/plaid/disconnect` with `item_id`, then refetches connections. On error, shows message in the error area.
- **Behavior:** Disconnect removes the **entire connection** (all accounts under that item). The connection disappears from every category it appeared in. If the user wants to reconnect, they click "Add Connection" again.

### 6.7 Recent Transactions module

- **Backend:**
  - **Plaid sync:** Uses `/transactions/sync` (cursor-based) to incrementally fetch transactions. On first link (exchange-token), runs an initial sync automatically.
  - **Storage:** New `transactions` table (`user_id`, `item_id`, `account_id`, `plaid_transaction_id`, `name`, `amount`, `date`, `account_name`). `plaid_items` gains a `sync_cursor` column for incremental sync position.
  - **Migration:** `server/migrations/002_transactions.sql` adds `sync_cursor` to `plaid_items` and creates `transactions` table. Run via `node server/run-migration.js` (now runs all migration files in order).
  - **`GET /api/plaid/transactions`** — auth required. Returns the most recent transactions for the user, ordered by date descending. Accepts `?limit=N` (default 25, max 100).
- **Frontend:**
  - **Two-column layout:** `/app` page is now side-by-side on large screens (lg breakpoint): Plaid Connections on left, Recent Transactions on right. Stacks vertically on mobile.
  - **RecentTransactions component:** Card matching Figma design (node 1-1944, right panel). Title "Recent Transactions" / "Latest activity across all accounts". "View All" button in top-right (placeholder, no functionality yet).
  - **Grouped by date:** Transactions grouped under uppercase date headers (e.g. "WEDNESDAY, FEBRUARY 25") with bottom border.
  - **Transaction row:** Name (Inter Medium 14px, #101828), account badge pill below (gray bg #f9fafb, border #d1d5dc, 12px text #4a5565), amount right-aligned (Inter SemiBold 14px; positive/income in blue #155dfc with "+" prefix, negative/expense in orange #f54900 with "-" prefix).
  - **Cap:** Shows most recent 25 transactions.
  - **Data refresh:** Transactions refetched after adding or disconnecting a connection.
- **Plaid amount convention:** Plaid returns positive amounts for money leaving the account (expenses) and negative for money entering (income). The UI flips this for display: negative Plaid amounts show as "+$X" in blue, positive as "-$X" in orange.


### 6.8 Refresh connection

- **Backend:** `POST /api/plaid/refresh` — body `{ item_id }`. Auth required. Runs incremental `/transactions/sync` for that item and updates `last_synced_at`. If Plaid returns `ITEM_LOGIN_REQUIRED`, returns 400 with `error_code: "ITEM_LOGIN_REQUIRED"` so the frontend can prompt reconnection.
- **Frontend:** Refresh icon button on each connection row calls `handleRefresh(connection)`. On success, refetches both connections (updated balances + last_synced_at) and transactions. On `ITEM_LOGIN_REQUIRED` error, shows a message prompting reconnection and refetches connections to surface the error state.

### 6.9 Error detection & reconnect

- **Backend:**
  - `GET /api/plaid/connections` now returns `error_code` per connection when Plaid balance calls fail (e.g. `ITEM_LOGIN_REQUIRED`).
  - `POST /api/plaid/link-token/update` — body `{ item_id }`. Creates a Plaid Link token in **update mode** (passes `access_token` instead of `products`), which lets the user re-authenticate without creating a new item.
- **Frontend:**
  - When a connection has `error_code === "ITEM_LOGIN_REQUIRED"`, a red "Reconnect" button appears below the status in the connection row.
  - Clicking "Reconnect" calls `/api/plaid/link-token/update` to get an update-mode link token, then opens Plaid Link. On success, Plaid Link completes without a `public_token` exchange (the existing `access_token` is updated server-side). The frontend refetches connections and transactions.
  - The Plaid Link hook tracks `linkMode` ("add" vs "reconnect") to skip the exchange-token call in reconnect mode.


### 6.10 Investments page

- **Route:** `/app/investments` (protected).
- **Backend:** `GET /api/plaid/investments` — for each connected item, calls Plaid `investmentsHoldingsGet`. Returns flattened `holdings` array with `institution_name`, `account_name`, `security_name`, `ticker`, `security_type`, `quantity`, `close_price`, `value`, `cost_basis`. Skips items that don’t support investments (`PRODUCTS_NOT_SUPPORTED` / `NO_INVESTMENT_ACCOUNTS`).
- **Frontend:** Card layout matching other pages. Header shows "Investments" / "Holdings across all investment accounts" with total portfolio value top-right. Holdings grouped by institution (uppercase bold header). Each row: security name + ticker badge, quantity/price/account details, current value right-aligned, gain/loss with percentage (green positive, orange negative).
- **Plaid products:** Link token now requests `['transactions', 'investments']` so new connections grant investment data access. Existing connections linked with only `transactions` won’t have investment data until re-linked.

### 6.11 Accounts page

- **Route:** `/app/accounts` (protected).
- **Backend:** `GET /api/plaid/accounts` — for each connected item, calls Plaid `accountsBalanceGet`. Returns flattened `accounts` array with `institution_name`, `account_id`, `name`, `type`, `subtype`, `current`, `available`, `currency`.
- **Frontend:** Card layout. Header shows "Accounts" / "All linked accounts and balances" with net worth top-right (assets minus liabilities). Accounts grouped by type (Deposits, Credit, Investments, Loans, Other) with count badges. Each row: account name + subtype, institution below, current balance right-aligned, available balance if different.
- **Net worth calculation:** Sum of all account `current` balances, with credit/loan balances subtracted.

### 6.12 Navigation

- **Header:** Shared `AppHeader` component used by all pages. Four nav buttons: Dashboard (`/app`), Transactions (`/app/transactions`), Investments (`/app/investments`), Accounts (`/app/accounts`). Active page button is filled dark; others are outlined. Vertical divider before red Logout button.
- **Routes:** All four pages are protected routes in `App.jsx`. Unauthenticated users redirect to `/`.

### 6.13 Consent, Privacy Policy & Terms of Service

- **Consent mechanism:** The logged-out landing page displays a consent line below the "Continue with Google" button: *"By continuing, you agree to our Privacy Policy and Terms of Service."* Both link to their respective pages. By clicking "Continue with Google", the user consents to data collection and processing as described in the Privacy Policy.
- **Privacy Policy page:** `/privacy` — user-facing, plain-language document explaining what data is collected, how it's used, how it's protected, retention/deletion practices, third-party services (Plaid, Firebase, Railway), and user rights (access, delete, know). Accessible without authentication.
- **Terms of Service page:** `/terms` — covers acceptance of terms, service description (read-only), financial data disclaimers, not-financial-advice disclaimer, third-party services, data/privacy reference, disconnection/deletion, prohibited use, limitation of liability. Accessible without authentication.
- **Internal compliance docs:** `docs/INFORMATION_SECURITY_POLICY.md` (security controls, incident response, risk assessment) and `docs/DATA_DELETION_AND_RETENTION_POLICY.md` (retention schedule, CCPA/CPRA rights, state law compliance, breach notification).

### 6.14 Spending graphs

- **Location:** Dashboard (`/app`), rendered above the existing Plaid Connections + Recent Transactions two-column layout.
- **Charts:** Three bar charts displayed side by side (stacked on mobile):
  - **Weekly Spending** — last 7 days, one bar per day (x-axis: day name).
  - **Monthly Spending** — last 4 weeks, one bar per week (x-axis: week start date).
  - **Yearly Spending** — last 12 months, one bar per month (x-axis: month abbreviation).
- **Spending definition:** Only actual purchases/payments (positive Plaid `amount` values). The following categories are **excluded** via the `personal_finance_category` field: `INCOME`, `TRANSFER_IN`, `TRANSFER_OUT`, `LOAN_PAYMENTS`, `BANK_FEES`, `RENT_AND_UTILITIES`. This prevents inter-account transfers, payroll, and bank fees from inflating spending totals.
- **Transaction metadata:** The `transactions` table stores `payment_channel` (in store / online / other) and `personal_finance_category` (Plaid's primary category label) for each transaction, populated during sync.
- **Backend:** `GET /api/plaid/spending-summary` — accepts `?period=week|month|year` and optional `&item_ids=id1,id2`. Returns `{ period, buckets: [{ label, date, total }] }`. Aggregation done server-side via SQL `SUM(amount) GROUP BY` date bucket with non-spending categories excluded.
- **Helper text:** Below the tab bar, a line of muted text reads: "Includes purchases and payments across all accounts. Transfers, income, and bank fees are excluded."
- **Connection filter:** Row of toggle pills above the charts, one per connected institution. All selected by default. Toggling a pill re-fetches all three charts filtered to the selected connections.
- **Charting library:** Recharts (`BarChart`, `ResponsiveContainer`, `Tooltip`).
- **Component:** `src/components/SpendingCharts.jsx`. Receives `connections` and `getToken` as props from `LoggedInPage`.

### 6.15 Net Worth graph

- **Placement:** Below the Spending graph, above the connections/transactions columns on the dashboard.
- **Visualization:** Recharts `AreaChart` with a single filled line for net worth. Gradient fill below the line for visual weight.
- **Range toggles:** `1W | 1M | 3M | YTD | 1Y | ALL` — styled as pill buttons in the card header.
- **Header area:**
  - Current net worth displayed large and bold.
  - Change amount and percentage vs start of the selected range (green for positive, red for negative).
  - Assets total and Debts total shown as smaller secondary values.
- **Data strategy:** Back-calculate historical daily balances from current Plaid account balances + stored transaction history.
  - **Formula:** `balance_on_day_X = current_balance + SUM(plaid_amounts after day_X)`
  - **Account classification:** Assets = `depository`, `investment`; Debts = `credit`, `loan`.
  - **Investment accounts:** Cannot be back-calculated (values change due to market fluctuations, not just transactions). Held at current value for all historical dates.
  - **Accuracy window:** Only as accurate as the available transaction history. If 90 days of transactions are synced, back-calculation is reliable for ~90 days.
- **Backend:** `GET /api/plaid/net-worth-history?range=1W|1M|3M|YTD|1Y|ALL` — fetches live balances from Plaid, pulls stored transactions from DB, walks backwards per account per day, aggregates into `{ assets, debts, net_worth }` per date.
- **Performance — Backend balance cache:** Plaid balance fetches are cached per user in memory with a 5-minute TTL. Subsequent range requests within the TTL reuse cached balances instead of making redundant Plaid API calls. Cache is invalidated immediately on connection add, disconnect, or refresh to ensure fresh data.
- **Performance — Frontend range pre-fetch:** On mount, the component fires parallel fetches for all 6 range options. Results are stored in a per-range cache in React state. Switching tabs reads from the local cache for instant rendering — no additional network round-trips. On parent-triggered refresh (via `useImperativeHandle`), all ranges are re-fetched in parallel.
- **Helper text:** "Net worth = assets minus debts across all connected accounts. Investment values reflect current holdings."
- **Refresh:** Auto-refreshes after adding, disconnecting, or refreshing a connection.
- **Component:** `src/components/NetWorthChart.jsx`. Receives `getToken` prop. Uses `forwardRef`/`useImperativeHandle` for parent-triggered refresh.

### 6.16 Investment Portfolio dashboard card

- **Placement:** Right column of the dashboard, above Recent Transactions. Sits opposite the Net Worth chart in the left column.
- **Data sources:**
  - Holdings/accounts: Existing `GET /api/plaid/investments` endpoint (Plaid `investmentsHoldingsGet`).
  - Chart history: New `GET /api/plaid/investment-history?range=1W|1M|3M|YTD|1Y|ALL` — filters cached balances to investment-type accounts, back-calculates daily values from stored transactions. Uses the same balance cache as Net Worth (5-min TTL).
- **Header area:**
  - Title: "Investment Portfolio".
  - Total portfolio value displayed large and bold.
  - Total gain/loss amount and percentage (green for positive, red for negative).
  - Period change amount and % shown below when chart data is loaded.
- **Line chart (AreaChart):**
  - Recharts `AreaChart` with purple gradient fill, showing portfolio value over time.
  - Range toggles: `1W | 1M | 3M | YTD | 1Y | ALL` — styled as pill buttons, purple when active.
  - Tooltip shows date and value on hover.
  - Helper text: "Portfolio value based on current holdings. Historical values are approximate."
  - Same limitations as Net Worth: investment account values fluctuate with the market, so back-calculated values are approximate.
- **Performance:** All 6 chart ranges pre-fetched in parallel on mount and cached in React state; tab switching is instant.
- **Section 1 — Account list:**
  - Holdings grouped by `account_name` + `institution_name`.
  - Each row shows: account name, institution, total value for that account.
  - Sorted by value descending.
- **Section 2 — Top Movers carousel:**
  - Up to 10 holdings sorted by **absolute gain/loss %** (biggest swings first, regardless of direction).
  - Gain % = `(value - cost_basis) / abs(cost_basis) * 100`. Holdings without `cost_basis` are excluded.
  - Each card shows: ticker badge, gain %, security name, current value, and gain/loss $.
  - Horizontal scroll via trackpad/mouse + left/right arrow buttons. Arrow buttons disabled at scroll boundaries.
  - Carousel container hides scrollbar (`scrollbar-width: none`) for clean appearance.
- **Refresh:** Auto-refreshes after adding, disconnecting, or refreshing a Plaid connection (same pattern as Spending/Net Worth).
- **Component:** `src/components/InvestmentPortfolio.jsx`. Receives `getToken` prop. Uses `forwardRef`/`useImperativeHandle` for parent-triggered refresh.

---

## 7. Not yet built (backlog)

- ~~**Disconnect:** POST to remove/unlink an item; trash button wired.~~ → Done (see 6.6).
- ~~**Refresh:**~~ → Done (see 6.8).
- ~~**Transactions API & UI:**~~ → Done (see 6.7). Sync, storage, and Recent Transactions UI implemented.
- **Error/reconnect:** When Plaid returns item error (e.g. login required), show “Reconnect” and optionally open Link again for that institution.
- **Production:** Switch Plaid to Production keys; complete launch checklist; add production domain to Firebase Authorized domains.

---

## 8. Design & UX references

- **Figma:** CoPilotV2 design (e.g. node 1-1944 for Plaid Connections). Card layout, section headers, connection row styling (colors, typography, spacing) follow Figma. Inter font; colors for status (Connected green, Error red).
- **Logged-out:** Design from Figma (headline, CTA). No arrow on CTA.

---

## 9. Deployment & env

- **Frontend env:** `VITE_FIREBASE_*` (from Firebase Console), `VITE_API_URL` (backend URL).
- **Backend env:** `PORT`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_PATH` (or `FIREBASE_SERVICE_ACCOUNT` JSON string for Railway). Optional: `CORS_ORIGIN`, `PLAID_WEBHOOK_URL` (Plaid sends SYNC_UPDATES_AVAILABLE here; we verify signature and sync).
- **Secrets:** Never commit `.env` or `firebase-service-account.json`; see `.gitignore`. Add production domain to Firebase Authorized domains before production deploy.

See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) for full deploy steps.

---

## 10. Changelog (PRD updates)

- **Initial:** Vision, stack, auth, data isolation, Plaid flow and API, implemented features (landing, logged-in, Plaid Connections with categorization and one-row-per-account), backlog, design references, deployment. Consolidated from GOOGLE_SSO_PLAN, PLAID_TRANSACTIONS_PLAN, DATA_ISOLATION, STACK_EXPLAINED, MILESTONE_1_IMPLEMENTATION and implementation decisions.
- **Investments & Accounts:** Added 6.10 (Investments page with holdings from Plaid), 6.11 (Accounts page with all accounts/balances/net worth), 6.12 (shared navigation). Backend GET /investments and GET /accounts endpoints. Plaid products expanded to include investments. All four nav buttons now wired to live routes.
- **Refresh & Reconnect:** Added 6.8 (refresh connection: re-sync transactions, update balances) and 6.9 (error detection + reconnect via Plaid Link update mode). Backend POST /refresh, POST /link-token/update; GET /connections returns error_code. Frontend refresh button wired, Reconnect button on ITEM_LOGIN_REQUIRED errors.
- **Transactions:** Added 6.7 (Recent Transactions module). Backend transactions/sync with cursor-based Plaid sync, transactions table + migration, GET /api/plaid/transactions. Frontend two-column layout, RecentTransactions component grouped by date, capped at 25, View All placeholder.
- **Disconnect:** Added 6.6 (disconnect a connection). Backend `POST /api/plaid/disconnect` deletes from DB and calls Plaid `/item/remove`. Frontend trash button shows confirmation, calls disconnect, refetches connections.
- **Consent & Legal:** Added 6.13 (Privacy Policy page at `/privacy`, Terms of Service page at `/terms`, consent line on landing page). Internal compliance docs: Information Security Policy and Data Deletion & Retention Policy.
- **Spending Graphs:** Added 6.14 (three bar charts — weekly, monthly, yearly — above dashboard content). Backend `GET /api/plaid/spending-summary` with SQL aggregation. Connection filter pills. Recharts library.
- **Spending Graph Filtering:** Charts now auto-refresh after adding, disconnecting, or refreshing a connection. Added `payment_channel` and `personal_finance_category` columns to transactions table (migration 003). Spending summary SQL excludes non-spending categories (transfers, income, bank fees, loan payments). Helper text added below chart tabs.
- **Net Worth Graph:** Added 6.15 (historical net worth line chart). Back-calculates daily account balances from current Plaid balances + stored transactions. AreaChart with 1W/1M/3M/YTD/1Y/ALL range toggles. Shows current net worth, change amount/percentage, and assets/debts breakdown. Investment accounts held at current value. Auto-refreshes on add/disconnect/refresh.
- **Net Worth Performance:** Backend: in-memory balance cache per user with 5-minute TTL avoids redundant Plaid API calls across range switches; cache invalidated on add/disconnect/refresh. Frontend: all 6 ranges pre-fetched in parallel on mount and cached in React state; tab switching is instant with no network requests.
- **Investment Portfolio Card:** Added 6.16 (dashboard investment portfolio). Right column of dashboard above Recent Transactions. Shows total portfolio value with gain/loss, account list grouped by account+institution, and a horizontal-scroll carousel of top 10 movers by absolute gain %. Uses existing `/api/plaid/investments` endpoint. Auto-refreshes on add/disconnect/refresh.
- **Investment Portfolio Chart:** Added AreaChart line graph to 6.16. New backend `GET /api/plaid/investment-history` endpoint back-calculates daily investment account values using cached balances + stored transactions. Purple gradient line chart with 1W/1M/3M/YTD/1Y/ALL range toggles. All ranges pre-fetched in parallel on mount for instant tab switching. Period change amount/% shown in header.
- **Webhooks & data freshness:** Optional `PLAID_WEBHOOK_URL`; webhook handler verifies Plaid JWT + body SHA-256, syncs on SYNC_UPDATES_AVAILABLE. Balances use `accountsBalanceGet`; Refresh button calls Plaid `transactions/refresh` then sync. Documented in PRD §5 and §9. Credit card payments excluded from spending (NON_SPENDING_CATEGORIES in server/db.js).

*When you add or change a product requirement or decision, add a short entry here and update the relevant section above.*
