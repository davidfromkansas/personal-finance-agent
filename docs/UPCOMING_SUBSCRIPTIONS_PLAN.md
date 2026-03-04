# Plan: Upcoming Subscriptions Due Module

## Goal

Add a **Subscriptions** module to the dashboard that shows upcoming subscription charges. It will sit **below the spending graph**, **to the left of the transactions module**, and **above the Net Worth chart**, filling the empty space in the middle-left of the dashboard.

## Reference UI

- **Header:** Title "Subscriptions", optional menu (three dots) on the right.
- **Subtitle:** "$X.XX remaining due" with a right arrow (clickable link to a detail view or subscriptions page).
- **List:** Each row shows:
  - **Icon:** Circular merchant/logo (or fallback initial/icon).
  - **Name:** Subscription name (bold).
  - **Frequency:** e.g. "Every month" (smaller, gray, below name).
  - **Cost:** Amount (bold, right-aligned).
  - **Due:** e.g. "in 3 days" (smaller, gray, below cost).
- **Layout:** Card with fixed height and scrollable list; clean separation between rows.

---

## 1. Data source: Plaid Recurring Transactions

- Use Plaid's **Recurring Transactions** product: [`/transactions/recurring/get`](https://plaid.com/docs/api/products/transactions/#transactionsrecurringget).
- Returns **outflow** (and inflow) streams derived from transaction history, with:
  - `stream_id`, merchant name, category
  - `frequency` (WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, ANNUALLY)
  - `average_amount`, `last_amount`
  - **`predicted_next_date`** (only set when Plaid can predict the next charge)
  - `status` (MATURE, EARLY_DETECTION, TOMBSTONED, UNKNOWN)
- **Constraints:** Recurring product must be enabled for your Plaid application. Streams are marked mature after ≥3 occurrences (≥2 for annual). Not all streams will have `predicted_next_date`.

---

## 2. Backend

### 2.1 New endpoint: `GET /api/plaid/recurring`

- **Auth:** Required (same as other Plaid routes; use `req.uid`).
- **Behavior:**
  1. Load all `plaid_items` for the user (same pattern as connections/transactions).
  2. For each item, call Plaid `transactionsRecurringGet` with that item's `access_token` (confirm exact method name in `plaid` npm package, e.g. `transactionsRecurringGet`).
  3. From the response, take **outflow** streams that have `predicted_next_date`.
  4. Optionally filter by `status` (e.g. only `MATURE` and maybe `EARLY_DETECTION`) to avoid noisy or dead streams.
  5. Merge streams from all items, sort by `predicted_next_date` ascending (soonest first).
  6. Compute **total remaining due** = sum of `last_amount` or `average_amount` for the selected streams (for the subtitle).
- **Response shape (suggested):**
  ```json
  {
    "subscriptions": [
      {
        "stream_id": "...",
        "merchant_name": "Netflix",
        "frequency": "MONTHLY",
        "average_amount": 22.99,
        "last_amount": 22.99,
        "predicted_next_date": "2026-03-12",
        "status": "MATURE"
      }
    ],
    "total_remaining_due": 59.42
  }
  ```
- **Error handling:** If an item returns e.g. `PRODUCT_NOT_READY` or recurring not enabled, skip that item and continue with others; return whatever streams were returned. Optionally log and surface a generic message if no items support recurring.

### 2.2 Plaid product configuration

- In the Plaid Dashboard, ensure **Recurring Transactions** (or Transactions product including recurring) is enabled for the application.
- No new DB tables are required; this is a live call to Plaid per request (or optionally cached with a short TTL if needed later).

---

## 3. Frontend

### 3.1 New component: `UpcomingSubscriptions` (or `SubscriptionsModule`)

- **Location:** e.g. `src/components/UpcomingSubscriptions.jsx` (or under `src/pages/` if you prefer to keep dashboard-specific blocks in the page).
- **Props:** Optional `getToken` (or use existing auth pattern) for `apiFetch`. Can accept `className` for layout.
- **Behavior:**
  - On mount, call `GET /api/plaid/recurring`.
  - **Loading:** Show a simple loading state (e.g. "Loading subscriptions…" or skeleton rows).
  - **Empty:** If `subscriptions.length === 0`, show a short message (e.g. "No upcoming subscriptions" or "Link accounts to see recurring charges") and optionally hide the "remaining due" line or show "$0 remaining due".
  - **List:** Map `subscriptions` to rows matching the reference:
    - **Icon:** Use first letter of `merchant_name` in a circle, or a generic subscription icon, or (if you add it later) Plaid's merchant logo URL if available in the API.
    - **Name:** `merchant_name`.
    - **Frequency:** Map `frequency` to human text (e.g. MONTHLY → "Every month", WEEKLY → "Every week", ANNUALLY → "Every year").
    - **Cost:** Format `last_amount` or `average_amount` as currency (e.g. `$22.99`).
    - **Due:** Compute "in X days" from `predicted_next_date` vs today; for today use "Today", for past (shouldn't happen often) "Overdue" or "X days ago".
  - **Header:** "Subscriptions"; right side: menu (three dots) if you want actions later (e.g. "Manage" or "Refresh").
  - **Subtitle:** "$X.XX remaining due" with a right arrow; link to `/app/subscriptions` or a modal (or no-op for now).
- **Styling:** Reuse the same card style as other dashboard modules (e.g. `rounded-[14px] border border-[#e5e7eb] bg-white`), consistent typography (e.g. Inter), and a fixed height with `overflow-y-auto` on the list so the module has a "natural bottom" like the transactions module.

### 3.2 Layout changes in `LoggedInPage.jsx`

- **Current:** One top row (Spending | Transactions) and one bottom row (Net Worth + Connections | Investment Portfolio).
- **Target:** Left column = vertical stack of three modules; right column = two modules.
  - **Left column (e.g. `flex-[2]` or same width as current spending column):**
    1. **Spending** (existing `SpendingCharts`).
    2. **Subscriptions** (new `UpcomingSubscriptions`).
    3. **Net Worth + Connections** (existing card).
  - **Right column (e.g. `flex-[1]`):**
    1. **Transactions** (existing `TransactionList` in a fixed-height wrapper).
    2. **Investment Portfolio** (existing).
- **Implementation approach:**
  - Use a two-column flex (or grid) for the main content:
    - Left: `flex flex-col gap-6` containing Spending, Subscriptions, Net Worth.
    - Right: `flex flex-col gap-6` containing Transactions, Investment Portfolio.
  - Keep `max-w-[1124px]` (or current max width) so the Subscriptions module aligns with the left column and sits directly below the spending graph and above the net worth card.
  - Give the Subscriptions card a fixed height (e.g. ~320–400px) and `overflow-y-auto` on the list so it doesn't stretch the column and has a clear bottom edge.

---

## 4. Optional enhancements (later)

- **Dedicated page:** `/app/subscriptions` with full list, history, and "remaining due" detail.
- **Caching:** Short-lived cache (e.g. 15–30 min) for `GET /api/plaid/recurring` to avoid calling Plaid on every dashboard load.
- **Merchant logos:** If Plaid provides logo URLs in the recurring response (or via a separate API), use them in the list.
- **Menu actions:** From the three-dot menu, "Refresh" or "Don't show this subscription" (would require storing user overrides).

---

## 5. Implementation order

1. **Backend:** Add `GET /api/plaid/recurring`; for each user item call Plaid recurring API, merge outflows with `predicted_next_date`, sort, return `subscriptions` + `total_remaining_due`.
2. **Frontend component:** Create `UpcomingSubscriptions`, fetch from `/api/plaid/recurring`, handle loading/empty, render list with icon, name, frequency, cost, "in X days".
3. **Layout:** In `LoggedInPage.jsx`, restructure so the left column stacks Spending → Subscriptions → Net Worth, and the right column stacks Transactions → Investment Portfolio; insert `UpcomingSubscriptions` and set a fixed height + scroll for the list.
4. **Polish:** Subtitle link, menu, frequency labels, and empty-state copy.

---

## 6. Files to touch

| Area        | File(s) |
|-------------|---------|
| Backend     | `server/routes/plaid.js` (new route `GET /recurring`) |
| Frontend    | New `src/components/UpcomingSubscriptions.jsx` (or equivalent) |
| Layout      | `src/pages/LoggedInPage.jsx` (layout restructure + render Subscriptions) |
| Config      | Plaid Dashboard: ensure Recurring Transactions (or Transactions with recurring) is enabled |

No new migrations or DB changes are required for the initial version.
