# Plan: Plaid for read-only credit card transaction data

## Goal

Give users **read-only** access to their credit card transaction data (e.g. Chase Sapphire) via Plaid. No moving money, no writing to accounts—only reading transactions (date, amount, merchant, category, etc.).

---

## How Plaid fits

- **Plaid** connects to thousands of institutions (including Chase, Amex, etc.). Users log in to their bank/card in a Plaid-hosted flow (Plaid Link).
- **Transactions product** returns up to 24 months of transaction history (date, amount, merchant, category, etc.). Read-only.
- **Credit cards** are supported: Plaid treats them like other accounts for the Transactions product.

---

## High-level flow

1. **User is logged in** (we already have Firebase Google SSO).
2. **User clicks “Connect account”** (or similar) in the app.
3. **Backend** creates a short-lived **link_token** (Plaid API + your `client_id` / `secret`).
4. **Frontend** opens **Plaid Link** with that `link_token`. User selects institution (e.g. Chase), logs in, selects accounts.
5. **Link** returns a one-time **public_token** to the frontend.
6. **Frontend** sends **public_token** to your backend.
7. **Backend** exchanges **public_token** for a long-lived **access_token** (and **item_id**). Store both securely, tied to the logged-in user.
8. **Backend** calls Plaid **/transactions/sync** (or /transactions/get) with **access_token** to fetch transactions. Optionally store transactions and/or cursor in your DB.
9. **Frontend** gets transaction data from your backend (your API), not directly from Plaid.

Plaid **never** gives the frontend an `access_token`; all Plaid API calls that use it must happen on your server. That’s how read-only stays secure and compliant.

---

## User experience: one sign-in (Google), one-time bank link (Plaid)

We want users to **sign in once with Google** and **connect their bank/card once**—not redo either every time they open the app.

**How we get there:**

| Step | Who does the work | When it happens |
|------|-------------------|------------------|
| **App identity** | **Google SSO (Firebase)** | User clicks “Continue with Google” once. Firebase keeps them logged in (session/token). When they return to the app, we already know who they are—no second Google login. |
| **Bank/card link** | **Plaid Link** | User clicks “Connect account” **once** (or once per bank/card they add). They go through Plaid’s flow (pick Chase, log into their bank, select accounts). We then store Plaid’s long-lived `access_token` and `item_id` in our DB **tied to their user id** (Firebase UID). |
| **Every later visit** | **Our backend + DB** | User is already signed in (Google session). We look up their user id, find their stored Plaid `access_token` in the DB, and call Plaid’s API (e.g. `/transactions/sync`) on the server to get transactions. We **never** show Plaid Link again unless they’re adding another account or we need them to reconnect (e.g. bank required re-auth, token revoked). |

So **Google SSO does the heavy lifting for “who is this person?”**—one sign-in, then we recognize them on every visit. **Plaid Link is a one-time (per account) action**; we persist the link in our database so day-to-day use is just: user opens app → we know who they are (Google) and which bank link we have (DB) → we show transactions from our API. No second login, no Plaid popup on every visit.

**When we would show Plaid again:** Adding a second bank/card, or if the existing link is invalid (e.g. user changed bank password, or they disconnected in their bank’s settings). In those cases we’d show “Reconnect account” and open Link again.

---

## Returning users: no re-connecting to Plaid

When a user comes back in a **new session** (different day, new browser, after closing the app), they should **not** have to go through Plaid Link again. Here’s how we guarantee that.

**What we persist**

- After the user completes Plaid Link **once**, the backend exchanges the one-time `public_token` for a **long-lived `access_token`** and an **`item_id`**.
- We **store** both in the database (e.g. `plaid_items` table) **tied to the user’s id** (Firebase UID). That row stays there until the user disconnects the account or we remove it (e.g. after Plaid tells us the item is invalid).

**What happens on the next session**

1. User opens the app again and signs in with Google (Firebase). We get the **same** Firebase UID as before.
2. Frontend calls **`GET /api/plaid/connections`** (with the Firebase token). Backend verifies the token, reads `user_id`, and loads **all rows from `plaid_items` where `user_id` = that UID**. No Plaid Link, no re-auth—we just read from our DB.
3. We return the list (institution name, status, last synced, etc.) and the frontend shows the Plaid Connections card with their existing links.
4. When we need transactions, the backend uses the **stored `access_token`** for that user/item to call Plaid’s API. Again, no Link—we already have the token.

So **the link is stored server-side by user id.** Every new session we identify the user with Firebase and load their stored links from the DB. They only see Plaid Link again if they click “Add Connection” (new institution) or we detect that an existing link is broken (e.g. Plaid returns `ITEM_LOGIN_REQUIRED`) and we show “Reconnect.”

**When we might need them to re-establish**

- **Item login required** – The bank required the user to log in again (e.g. password change). Plaid will return an error; we can show “Reconnect” for that item and open Link again for that institution only.
- **User removed the connection** – They (or we) called disconnect; we deleted the row. To link that bank again, they’d use “Add Connection” and go through Link once more.
- **New device / new browser** – No difference. We don’t store the link in the browser; we store it in the DB by user id. So as long as they sign in with the same Google account, we have their links.

---

## What you need to add

Right now the app is **frontend + Firebase only**. To use Plaid you need:

| Piece | Purpose |
|-------|--------|
| **Backend API** | Create link_token, exchange public_token, store access_token/item_id, call /transactions/sync (or get), expose your own API to the frontend for transaction data. |
| **Database** | Store per user: `access_token`, `item_id`, optional `cursor` for sync, and optionally a copy of transactions so you don’t hit Plaid on every page load. |
| **Plaid account** | [Dashboard](https://dashboard.plaid.com): API keys, complete app/company profile. Use Sandbox first, then Production. |

So: **backend + DB + Plaid account** are required; the frontend only talks to your backend and to Plaid Link (with the link_token).

---

## Decisions recorded

- **Repo layout:** Backend lives in the **same repo under `/server`**.
- **Transactions:** **Persist transactions in the DB** for caching, search, and future natural-language chat about spending (e.g. “How much did I spend on dining last month?”). The chat feature will query your own DB rather than calling Plaid on every question.
- **Backend:** **Node + Express** under `/server`.
- **Database:** **Postgres** via **Railway** (Railway Postgres).
- **Hosting:** **Railway** for backend service, frontend (static or Node serve), and Postgres—all on Railway.

---

## Backend options (fits Railway)

- **Node + Express** (or Fastify): Simple REST API. Good if you want to keep the current Vite/React app as-is and add a separate service.
- **Next.js API routes**: If you later move the app to Next.js, the same plan applies; just implement the endpoints as API routes and keep the frontend in Next.

For **Railway**, a Node server that exposes the endpoints below is enough. Env vars: `PLAID_CLIENT_ID`, `PLAID_SECRET`, and your DB URL.

---

## Backend + DB: pros and cons

You need both a **backend runtime** and a **database**. Below are options that work well with `/server` in the same repo and with persisting transactions for search and future NL chat.

### Backend runtime

| Option | Pros | Cons |
|--------|------|------|
| **Node + Express** | Huge ecosystem, Plaid’s official SDK is Node, easy to add routes and middleware (e.g. Firebase auth). Fits Railway and `/server` cleanly. | You own the structure (folder layout, env, logging). |
| **Node + Fastify** | Same as above but faster and more schema-friendly (e.g. validation). | Slightly smaller ecosystem than Express; still very common. |
| **Next.js API routes** | Single repo for frontend + API if you move the app to Next. | You’re not on Next yet; would require migrating the current Vite/React app. |

**Recommendation:** **Node + Express** (or Fastify) under `/server`. Keeps the current frontend as-is, and Plaid’s docs/samples are Node-based. You can run `node server` (or `npm run dev` in `/server`) on Railway as one service.

---

### Database

| Option | Pros | Cons |
|--------|------|------|
| **Postgres (e.g. Railway Postgres)** | Strong for relational data (users, items, transactions). Great querying: filters, date ranges, aggregates (“sum by category”), full-text search, and later vector/embeddings for NL chat. Built-in backups, scaling, and tooling. Railway has native Postgres; one less external service. | You manage schema and migrations (e.g. with Prisma or Drizzle). |
| **SQLite** | No separate DB server; single file. Simple for local/dev and small deployments. Good for prototyping. | Weaker for concurrent writes and scale. Railway can run it, but Postgres is usually better for multi-user + future NL features. |
| **Firebase Firestore** | You already use Firebase for auth; one vendor. Realtime listeners if you ever need live updates. | No SQL; querying is more limited (e.g. “sum by category last 30 days” is harder). Less natural fit for analytics and NL chat over structured transaction rows. You’d store transactions as documents and query by indexes; complex aggregations get clumsy. |
| **MongoDB** | Flexible schema, good for document-shaped data. | Transaction data is naturally tabular (date, amount, merchant, category); Postgres is a better fit. Plaid’s data is row-like; you’d still model “one doc per transaction” or embed arrays, and aggregations are easier in SQL. |

**Recommendation:** **Postgres** (e.g. Railway Postgres). You’re persisting transactions for **caching, search, and natural-language chat**. Postgres gives you:

- Simple queries: “transactions for user X, date range Y, category Z.”
- Aggregations: “total by category,” “monthly spend,” “top merchants.”
- Full-text search on merchant/description for “show me coffee shops.”
- Later: vector column or separate table for embeddings so NL chat can do semantic search over transactions.

Firestore can store the same data, but expressing “sum spending by category for the last 3 months” or “find transactions similar to this question” is more work than in SQL. For a finance/analytics + chat product, Postgres is the better fit.

---

### Summary

- **Backend:** Node + Express in `/server`. Same repo, deploy as one service on Railway.
- **DB:** Postgres via Railway (Railway Postgres). Store PlaidItem + Transaction tables; use for API responses, search, and future NL chat.
- **Hosting:** Railway for Postgres, backend API, and frontend (e.g. static build or served by backend).

---

## Data model

- **User** – Identified by Firebase UID (from your existing auth).
- **PlaidItem** (per linked account/login):
  - `user_id` (Firebase UID)
  - `item_id` (from Plaid)
  - `access_token` (encrypted at rest; never send to frontend)
  - `cursor` (for /transactions/sync)
  - `institution_id` / `institution_name` (from Link metadata; optional, for display)
- **Transaction** (persisted for caching, search, and future NL chat):
  - `id` (your primary key)
  - `user_id` (Firebase UID)
  - `item_id` (from Plaid)
  - `plaid_transaction_id` (Plaid’s id; unique per item)
  - `date`, `amount`, `name`, `merchant_name`, `category` (or category array), `account_id`, etc.
  - Optionally later: `embedding` or similar for semantic search in chat.

---

## API design (backend)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| **POST /api/plaid/link-token** | POST | Creates a Plaid link_token. Body: none (user from auth). Returns `{ link_token }`. Required for opening Plaid Link when user clicks “Add Connection”. |
| **POST /api/plaid/exchange-token** | POST | Body: `{ public_token }`. Exchanges for access_token, stores Item for current user. Returns e.g. `{ item_id, institution_name }`. Called from frontend after Plaid Link `onSuccess`. |
| **GET /api/plaid/connections** | GET | Returns the list of linked items for the current user (for the Plaid Connections card: institution name, account summary, status, last_synced, etc.). No body. |
| **GET /api/plaid/transactions** | GET | Returns transactions for the current user from your DB (and optionally triggers a Plaid sync in background). Optional query: `cursor`, `start_date`/`end_date`. Supports pagination. |
| **POST /api/plaid/disconnect** | POST | Body: `{ item_id }` (or similar). Removes that Item for the current user (and optionally calls Plaid /item/remove). Used by the trash button on a connection row. |

Auth: Use the same Firebase ID token (or your own session) to identify the user on every request. Never send Plaid `access_token` to the frontend.

**Plaid Connections card: status + last sync in the UI**

The UI must show for each connection:

- **Connection status** – **Connected** (green badge) or **Error** (red badge with alert icon). The backend returns `status: "connected"` or `status: "error"` per item (e.g. set `error` when Plaid has returned `ITEM_LOGIN_REQUIRED` or a sync failure for that item).
- **Last sync time** – **"Last synced X ago"** (e.g. "2 hours ago", "1 day ago"). The API should return **`last_synced_at`** (ISO 8601 timestamp) per item; the frontend formats it as relative time. If the item has never been synced, return `last_synced_at: null` and the UI shows "Last synced never" or "Not synced yet".

So `GET /api/plaid/connections` response shape per item should include: `item_id`, `institution_name`, **`status`** (`"connected"` | `"error"`), optional `account_summary`, and **`last_synced_at`** (ISO string or null). The existing Plaid Connections component already has the UI for status and last sync; it will consume these fields when wired to the API.

---

## Frontend changes

**Entry point:** The **“Add Connection”** button on the logged-in page (Plaid Connections card) initiates the full Plaid Link flow. When the user clicks it, we run the sequence below.

1. **“Connect account”** (or “Link bank/card”) entry point on the logged-in page (e.g. a button or a dedicated “Linked accounts” section).
2. **Fetch link_token**: Call `POST /api/plaid/link-token` (with auth), get `link_token`.
3. **Plaid Link**: Use [Plaid Link for React](https://www.npmjs.com/package/react-plaid-link) (or the vanilla script). Initialize with `link_token`; in `onSuccess`, send `public_token` to `POST /api/plaid/exchange-token`.
4. **List / show transactions**: Call `GET /api/plaid/transactions` and render (table, list, or chart). Handle loading and errors (e.g. “Reconnect account” if Item is invalid).
5. **Disconnect**: Call `POST /api/plaid/disconnect` and refresh state.

Plaid Link will show the institution list (Chase, etc.); user selects and logs in with their bank credentials. You never see those credentials—Plaid handles that.

---

## “Add Connection” flow (step-by-step)

This is what happens when the user clicks **“Add Connection”** on the logged-in page.

| Step | Where | What happens |
|------|--------|----------------|
| 1 | **Frontend** | User clicks “Add Connection”. Handler runs (e.g. `handleAddConnection`). |
| 2 | **Frontend** | Call `POST /api/plaid/link-token` with the user’s Firebase ID token in `Authorization: Bearer <token>`. |
| 3 | **Backend** | Verify Firebase token → get `user_id` (Firebase UID). Create a Plaid link_token via Plaid’s API (`products: ['transactions']`, `user: { client_user_id: user_id }`, etc.). Return `{ link_token }` to the frontend. |
| 4 | **Frontend** | Receive `link_token`. Open Plaid Link (e.g. `react-plaid-link` or `Plaid.create({ token: link_token, onSuccess, onExit })` and call `.open()`). |
| 5 | **User** | Plaid Link UI appears (modal or redirect). User selects institution (e.g. Chase), logs into their bank, selects accounts to link. |
| 6 | **Frontend** | Plaid Link calls `onSuccess(public_token, metadata)`. Frontend sends `POST /api/plaid/exchange-token` with body `{ public_token }` and the same auth header. |
| 7 | **Backend** | Verify auth again → get `user_id`. Exchange `public_token` with Plaid for `access_token` and `item_id`. Store a new row in `plaid_items` with `user_id`, `item_id`, `access_token` (and optionally `institution_name` from metadata). Optionally trigger a first `/transactions/sync` and persist transactions. Return e.g. `{ item_id, institution_name }` or `{ ok: true }`. |
| 8 | **Frontend** | On success: close Link UI, refresh the list of connections (call `GET /api/plaid/connections` or refetch the data that powers the Plaid Connections card), and optionally show a short success message. On failure: show an error message (e.g. “Couldn’t connect account. Try again.”), stay on the same page. |

**Errors to handle on the frontend:**

- **Link token failed** (e.g. 401 or 500 from `/link-token`): Show “Something went wrong. Please try again.” and don’t open Link.
- **User closed Link without connecting** (`onExit`): No request to exchange; just close the UI. Optional: track for analytics.
- **Exchange failed** (e.g. 400/500 from `/exchange-token`): Show “We couldn’t link that account. Please try again or choose another institution.”

Once this flow is implemented, “Add Connection” is the only place we need to start Plaid Link for linking a new institution. Reconnect flows can use the same sequence (get link_token → open Link → exchange → refresh).

---

## Read-only and compliance

- You’re only requesting the **Transactions** product. No Auth (routing numbers for ACH), no Transfer, no Identity unless you add it later. So the integration is **read-only** by product choice.
- Plaid’s [End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy) and your app’s privacy policy should be shown to users before they connect an account. Link can show a custom legal name; you can also add a short “We only read transaction data” note in your UI.
- Store `access_token` and any PII securely (env for secrets, DB with encryption at rest if required). Don’t log raw tokens.

---

## Plaid setup checklist

- [ ] [Create Plaid account](https://dashboard.plaid.com/signup) and get [API keys](https://dashboard.plaid.com/developers/keys) (Sandbox first).
- [ ] Complete [application](https://dashboard.plaid.com/settings/company/app-branding) and [company](https://dashboard.plaid.com/settings/company/profile) profiles (needed for many institutions in Production).
- [ ] In link_token request: `products: ['transactions']`, `country_codes: ['US']`. Optionally set `transactions.days_requested` (e.g. 90 or 365).
- [ ] For Production: complete Plaid’s [launch checklist](https://plaid.com/docs/launch-checklist/) and switch to Production keys.

---

## When we sync with Plaid (sync frequency)

We don’t sync on a fixed wall-clock schedule by default. Sync happens in these cases:

| Trigger | When | Purpose |
|--------|------|--------|
| **Right after link** | When the user completes “Add Connection” and we exchange the public token | Backend does an initial `/transactions/sync` (and stores cursor + transactions) so we have data and a baseline for future syncs. |
| **User clicks Refresh** | When the user clicks the refresh icon on a connection row | Backend calls `/transactions/sync` for that item, updates the DB and cursor, and can return updated `last_synced_at`. |
| **User opens transactions** | Optional: when the user hits GET /api/plaid/transactions (or the transactions view) | We can either serve from DB only, or “sync in background” (e.g. if `last_synced_at` is older than X hours, trigger a sync and then serve from DB). Keeps data fresh without blocking the request. |
| **Webhook (optional)** | When Plaid sends a webhook that new transactions are available | Backend receives the webhook, calls `/transactions/sync` for the relevant item, updates DB. User sees fresh data next time they load. No polling. |

**Recommended approach**

- **Phase 1:** Sync **on link** (first time) and **on Refresh** (user-initiated). Serve transactions from DB; no background cron. “Last synced” reflects the time of the last successful sync (from link or refresh). Simple and predictable.
- **Phase 2 (optional):** Add **webhooks**: register a webhook URL with Plaid so they notify us when new transactions exist; we then run `/transactions/sync` for that item and update `last_synced_at`. Data stays fresh without the user having to click Refresh.
- **Phase 3 (optional):** “Sync when stale” on GET /api/plaid/transactions: if `last_synced_at` is older than e.g. 6 or 24 hours, trigger a background sync before (or after) responding. Balances freshness and Plaid API usage.

We do **not** need to poll Plaid on a fixed interval (e.g. every hour) unless you want that; webhooks + on-demand refresh (and optional “sync when stale”) are usually enough and avoid unnecessary API calls.

---

## Decisions still open

1. **How far back to request** – `transactions.days_requested`: 90 (default), 365, or 730 (max). Affects latency and Plaid billing.
2. **Sync vs get** – `/transactions/sync` is preferred (cursor-based, supports webhooks). Use `/transactions/get` if you only need a fixed date range and don’t need incremental updates.
3. **Webhooks** – Optional: register a webhook in link_token and in Plaid Dashboard to get notified when new transactions are available; then call /transactions/sync. Improves freshness; can add later.

---

## Pre-implementation considerations

Before you start building, think through the following so nothing blocks you mid-way.

### 1. Plaid account and environment

- **Sandbox first** – Use Plaid Sandbox keys for all development and testing. Sandbox has test institutions and doesn’t hit real banks. Switch to Production only when you’re ready to launch.
- **Dashboard setup** – [Application profile](https://dashboard.plaid.com/settings/company/app-branding) and [company profile](https://dashboard.plaid.com/settings/company/profile) must be completed before many Production institutions work. Do this early.
- **API keys** – Store `PLAID_CLIENT_ID` and `PLAID_SECRET` in env only (e.g. Railway, `.env`). Never in frontend or in git.
- **Rate limits and billing** – Be aware of Plaid’s [rate limits](https://plaid.com/docs/api/rate-limits/) and that the Transactions product is billed per Item (per linked institution). Sync frequency (on link, on refresh, optional webhook) keeps calls predictable.

### 2. Backend auth and config

- **Firebase Admin SDK** – Backend must **verify** the Firebase ID token on every request (e.g. `Authorization: Bearer <token>`). Use Firebase Admin SDK `auth().verifyIdToken(token)` to get the user’s UID. Reject with 401 if missing or invalid. Never trust a `user_id` from the request body for authorization.
- **CORS** – If the frontend is on a different origin (e.g. `localhost:5173` vs `localhost:3001`), configure CORS on the backend to allow the frontend origin and credentials if you send cookies.
- **API base URL** – Frontend needs the backend base URL (e.g. `VITE_API_URL` or `VITE_PLAID_API_URL`) for `POST /api/plaid/link-token`, etc. Set it per environment (dev vs production).

### 3. Data model and “status”

- **How you set `status`** – Each item in `GET /api/plaid/connections` needs `status: "connected"` or `"error"`. Options: (a) store a `status` (or `error_code`) column on `plaid_items` and set it when a sync fails (e.g. Plaid returns `ITEM_LOGIN_REQUIRED`) or when you last successfully synced; (b) or call Plaid’s item/get or infer from last sync result when building the list. Decide up front so the UI always has a clear status.
- **`last_synced_at`** – Update this column (or equivalent) on every **successful** `/transactions/sync` for that item. If sync fails, don’t update it (so “Last synced 2 hours ago” still reflects the last good sync).
- **Migrations** – Use a migration tool (e.g. Prisma migrate, Drizzle, or raw SQL migrations) so schema changes are repeatable and documented. Don’t hand-edit production DB.

### 4. Errors and edge cases

- **Link token fails** (e.g. Plaid API down, bad keys) – Frontend should show a clear message and not open Link. Log on backend for debugging.
- **User exits Link without connecting** – `onExit` fires; no exchange. Don’t show an error. Optionally track for analytics.
- **Exchange fails** (e.g. invalid or expired public_token) – Show “We couldn’t link that account. Try again.” and keep user on the same page.
- **Sync fails for an item** (e.g. `ITEM_LOGIN_REQUIRED`, `PRODUCT_NOT_READY`) – Mark that item as `status: "error"` (and optionally store `error_code`). Show “Reconnect” in the UI for that row. Don’t delete the item unless the user clicks Remove.
- **Multiple items per user** – A user can link Chase and Amex; each is one row in `plaid_items`. List and transactions APIs should support multiple items and scope by `user_id`.

### 5. Security

- **Access token** – Never log it, never send it to the frontend, never put it in a URL. Store in DB; consider encrypting the column at rest if your compliance requires it.
- **Webhooks (if you add them)** – Plaid signs webhook payloads. Verify the signature using Plaid’s webhook verification docs before trusting the event. Ignore unverified requests.
- **Inputs** – Validate `public_token` and `item_id` (format, non-empty). Use the authenticated user for all DB lookups; never use client-supplied `user_id` or `item_id` to access another user’s data.

### 6. Legal and user disclosure

- **Privacy policy and terms** – You should have a privacy policy and terms that cover linking bank accounts and how you use transaction data. Plaid’s [End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy) may need to be linked or summarized.
- **What we tell users** – Before or during Link, users should understand that they’re connecting their account read-only, what data you access, and that Plaid is the connector. Plaid Link can show your app name; you can add a short “We only read transaction data” line in your UI.

### 7. Testing

- **Sandbox institutions** – In Sandbox, use Plaid’s test institutions and credentials (see Plaid docs). You can simulate success, login required, and other flows.
- **Manual testing** – Test: link → see connection → refresh → see updated “Last synced” → disconnect → connection gone. Test error state (e.g. in Sandbox, trigger an item that requires re-login and confirm “Reconnect” appears).

### 8. Rollout

- **Order** – Implement backend + DB + link-token + exchange first; then wire “Add Connection” and the connections list. Add transactions sync and GET /api/plaid/transactions next; then disconnect and error handling. Optional: webhooks and “sync when stale” later.
- **Production** – Before going live: Production Plaid keys, complete app/company profile, [Plaid launch checklist](https://plaid.com/docs/launch-checklist/), and add your production domain to Firebase Authorized domains (already in your deploy checklist).

Having these decided or documented before you code will reduce rework and make the implementation smoother.

---

## Simplest end-to-end milestone

The **smallest slice** that proves the full flow works:

**Goal:** User clicks “Add Connection” → goes through Plaid Link (Sandbox) → we save the link → they see their new connection in the Plaid Connections card with “Connected,” “Last synced just now,” and **current balance** for the linked account(s). No transactions view yet, no disconnect/refresh—just link one account, see it in the list, and see live balance to prove the integration works.

**In scope**

| Layer | What to build |
|-------|----------------|
| **Backend** | Node + Express under `/server`. Firebase Admin to verify ID token and get UID. Three endpoints only: `POST /api/plaid/link-token`, `POST /api/plaid/exchange-token`, `GET /api/plaid/connections`. **GET /api/plaid/connections** must call Plaid’s [Accounts Balance Get](https://plaid.com/docs/api/products/accounts/#accountsbalanceget) per stored item and return each connection with **accounts** (name, type, subtype) and **current balance** so the UI can show real data. |
| **DB** | One table: **`plaid_items`** with `user_id`, `item_id`, `access_token`, `institution_name`, `last_synced_at` (optional for milestone: set to “now” when we exchange, or after one sync). No `transactions` table yet. Balances are not stored; fetched live from Plaid when loading connections. |
| **Plaid** | After exchange, call **one** `/transactions/sync` (no cursor persistence required for milestone) so we have data for later and can set `last_synced_at`. Or skip sync and set `last_synced_at` to now on exchange—simplest. Use **accounts/balance/get** when serving GET /api/plaid/connections. |
| **Frontend** | “Add Connection” → GET link-token (with auth) → open Plaid Link with that token → onSuccess send public_token to exchange-token → on success call GET /api/plaid/connections and **replace** the placeholder list with the API response. Show “Connected,” “Last synced just now” (or format `last_synced_at`), and **current balance** (e.g. per account or summed) so users see real data and we prove the link works. |

**Out of scope for this milestone**

- GET /api/plaid/transactions and a transactions view
- Disconnect (trash button) and Refresh button behavior
- Transaction table and persisting transaction rows
- Webhooks, “sync when stale,” or multiple items (one item per user is enough to prove the flow)
- Production keys (use Sandbox only)

**Definition of done**

1. User is logged in (Google).
2. User clicks “Add Connection,” Plaid Link opens with a link_token from our backend.
3. User picks a Sandbox institution and completes Link.
4. Frontend exchanges the public_token; backend stores the item and returns success.
5. Frontend fetches GET /api/plaid/connections and the card shows one row: the linked institution, “Connected,” “Last synced just now” (or equivalent), and **current balance** (from Plaid) so we prove real data is flowing.
6. Refreshing the page still shows that connection and its balance (data from DB + live balance from Plaid, keyed by user).

Once this works, add in order: **disconnect** → **GET /api/plaid/transactions** + transactions UI → **refresh button** → **transactions table** and persistence.

--- 

## Implementation order

1. **Plaid account + backend skeleton** – New Node service, env for `PLAID_CLIENT_ID`, `PLAID_SECRET`, DB connection.
2. **POST /api/plaid/link-token** and **POST /api/plaid/exchange-token** – Create link_token, exchange and store Item (access_token, item_id) by user.
3. **Database** – PlaidItem table (and optionally Transaction), migrations.
4. **GET /api/plaid/transactions** – Read from your DB (and optionally trigger /transactions/sync in background); return paginated/filtered transactions. Persist new/updated transactions from sync into Transaction table.
5. **Frontend** – “Connect account” button, Plaid Link with link_token, onSuccess → exchange-token, then “View transactions” calling GET /api/plaid/transactions.
6. **Disconnect** – POST /api/plaid/disconnect + optional /item/remove.
7. **Error handling** – Item errors (e.g. login required), show “Reconnect” and optionally remove Item.
8. **Production** – Switch to Production keys, add webhook if desired, complete launch checklist.

---

## Summary

- **Read-only**: Use only Plaid’s **Transactions** product; no Transfer/Auth for moving money.
- **Chase Sapphire (and others)**: Supported via Plaid Link; user selects Chase and logs in; credit card accounts return transaction data.
- **You need**: A backend (Node + Express in `/server`), Postgres (e.g. Railway) for PlaidItem + Transaction storage, and Plaid API keys. Frontend uses Plaid Link with a backend-issued link_token and talks to your API for transaction data. Persisting transactions supports caching, search, and future natural-language chat about spending.

If you want to proceed, the next step is choosing backend + DB (e.g. Node + Postgres on Railway) and implementing the four endpoints above; then wire the frontend to them.
