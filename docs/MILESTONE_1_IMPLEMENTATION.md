# Milestone 1: Implementation Checklist

What we need to implement the first Plaid milestone: **link one account → see it in the list with “Connected,” “Last synced,” and current balance.**

---

## Prerequisites (you do these once)

| Item | What to do |
|------|------------|
| **Plaid account** | Sign up at [dashboard.plaid.com](https://dashboard.plaid.com). Create an app and get **Sandbox** `client_id` and `secret`. |
| **Postgres** | Create a Postgres database (e.g. [Railway](https://railway.app) or local). You’ll need a connection URL for the server. |
| **Firebase Admin** | In Firebase Console → Project settings → Service accounts, generate a **private key** (JSON). The server needs this to verify ID tokens and get `uid`. |

---

## 1. Backend: Node + Express in `/server`

- [ ] **Scaffold** a Node + Express app under `server/`:
  - `package.json` with `express`, `plaid`, `pg` (or `postgres`), `firebase-admin`, `cors`, `dotenv`
  - Entry point (e.g. `server/index.js`) that listens on a port (e.g. `process.env.PORT || 3001`)
  - CORS allowed for the frontend origin (e.g. `http://localhost:5173` in dev)
- [ ] **Env file** `server/.env` (gitignored) with:
  - `PLAID_CLIENT_ID`, `PLAID_SECRET` (Sandbox)
  - `DATABASE_URL` (Postgres connection string)
  - `FIREBASE_PROJECT_ID` and Firebase Admin credentials (e.g. path to service account JSON or `GOOGLE_APPLICATION_CREDENTIALS`)
- [ ] **Auth middleware**: read `Authorization: Bearer <id_token>`, verify with Firebase Admin, attach `req.uid`. Reject 401 if missing or invalid.

---

## 2. Database: `plaid_items` table

- [ ] **Migration or SQL** to create one table:

```sql
CREATE TABLE plaid_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  item_id    TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);
```

- [ ] No `transactions` table for this milestone. Balances are fetched live from Plaid.

---

## 3. Backend: Plaid client and three endpoints

- [ ] **Plaid client** (Node): initialize with `PLAID_CLIENT_ID`, `PLAID_SECRET`, environment `sandbox`.
- [ ] **POST /api/plaid/link-token** (protected)
  - Requires auth (Firebase ID token → `req.uid`).
  - Call Plaid `linkTokenCreate` with `user: req.uid`, products `['transactions']`.
  - Return `{ link_token }`.
- [ ] **POST /api/plaid/exchange-token** (protected)
  - Body: `{ public_token }`.
  - Call Plaid `itemPublicTokenExchange`. Get `access_token`, `item_id`.
  - Optionally call Plaid `institutionsGetById` (or use metadata from Link) for `institution_name`.
  - Set `last_synced_at` to `new Date()` (or run one `transactions/sync` and then set it).
  - Insert into `plaid_items` with `user_id = req.uid`. On conflict (same user + item_id) update `access_token`, `institution_name`, `last_synced_at`.
  - Return e.g. `{ success: true }`.
- [ ] **GET /api/plaid/connections** (protected)
  - Load all `plaid_items` for `req.uid`.
  - For each item, call Plaid **accounts/balance/get** with that item’s `access_token`.
  - Return array of connections, each with: `id`, `item_id`, `institution_name`, `status` (e.g. `connected`; if Plaid returns an error for that item, use `error`), `last_synced_at`, and **accounts** (name, type, subtype, **current balance**). Shape the balance per Plaid’s response (e.g. `current` for depository/credit).

---

## 4. Frontend: Auth token for API calls

- [ ] **AuthContext**: expose a way to get the Firebase ID token so the frontend can send it to the backend.
  - Option A: expose `getIdToken()` that returns `auth.currentUser.getIdToken()` (or null if not logged in).
  - Option B: expose the underlying Firebase `user` so callers can do `user.getIdToken()`.
- [ ] **API helper** (e.g. `src/lib/api.js`): base URL for the backend (e.g. `import.meta.env.VITE_API_URL`), and a function that adds `Authorization: Bearer <id_token>` to requests. Use `getIdToken()` before each call or cache and refresh when 401.

---

## 5. Frontend: Plaid Link and connections list

- [ ] **Env**: add `VITE_API_URL` (e.g. `http://localhost:3001`) to `.env` and `.env.example`.
- [ ] **Plaid Link**: install `react-plaid-link` (or use Plaid Link script).  
  - “Add Connection” → call GET link-token (with auth) → open Link with that `link_token`.  
  - `onSuccess(public_token)` → POST exchange-token with `public_token` → on success, refetch connections and close Link.
- [ ] **Fetch connections on load**: when `LoggedInPage` mounts (and when user is defined), GET /api/plaid/connections. Store in state.
- [ ] **Render list**: replace `PLACEHOLDER_CONNECTIONS` with the API response.  
  - Each row: institution name, status (“Connected” / “Error”), “Last synced …” from `last_synced_at`, and **current balance** (e.g. sum of accounts’ current balance, or show per-account: “Checking $1,234.56, Savings $5,000.00”).  
  - If API returns empty array, show empty state (no placeholder rows).
- [ ] **Error handling**: link-token fail → show message. User exits Link without completing → no error. Exchange fail → show message and don’t add a row.

---

## 6. Run and test

- [ ] **Start Postgres** and run the migration:
  ```bash
  psql "$DATABASE_URL" -f server/migrations/001_plaid_items.sql
  ```
- [ ] **Start backend**: `cd server && npm install && npm run dev` (or `node index.js`). Ensure `server/.env` has `PLAID_CLIENT_ID`, `PLAID_SECRET`, `DATABASE_URL`, and `FIREBASE_SERVICE_ACCOUNT_PATH` (path to your Firebase service account JSON).
- [ ] **Start frontend**: From repo root, `npm run dev`. Ensure root `.env` has `VITE_API_URL=http://localhost:3001` (or your backend URL).
- [ ] **Test**: Log in with Google → Add Connection → complete Plaid Link in Sandbox (use Plaid’s test credentials) → see one row with institution, “Connected,” “Last synced just now,” and **current balance**. Refresh page → row and balance still there.

---

## Summary

| Layer | Deliverable |
|-------|-------------|
| **Server** | Express app in `/server`, Firebase Admin auth middleware, Plaid client (sandbox), 3 routes: link-token, exchange-token, GET connections (with accounts/balance from Plaid). |
| **DB** | One table `plaid_items` (user_id, item_id, access_token, institution_name, last_synced_at). |
| **Frontend** | getIdToken (or equivalent) in AuthContext; API helper with auth header; Add Connection → Link → exchange → refetch; connections list from API with balance displayed. |

Once this works, next steps: disconnect, then GET /api/plaid/transactions and transactions UI, then refresh button and persistence.
