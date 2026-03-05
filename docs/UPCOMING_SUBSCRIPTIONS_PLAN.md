# Plan: Upcoming Recurring Payments Module

## Goal

Add an **Upcoming Recurring Payments** module to the dashboard that shows upcoming recurring charges (subscriptions, bills, etc.). It lives in the **2-column slot** in the middle row, **below the spending graph** and **above the Net Worth chart**, next to the 3-column module.

## Reference UI

- **Header:** Title "Upcoming Recurring Payments", optional menu (three dots) on the right.
- **List:** Each row shows:
  - **Logo/icon:** First letter of the merchant name in a circle (no external assets). Optionally later, use Plaid’s `logo_url` if the recurring API returns it.
  - **Name:** Merchant/payee name (bold).
  - **Category:** Personal finance category as a small tag (e.g. "Subscription", "Streaming") when Plaid provides it.
  - **Frequency:** e.g. "Every month" (smaller, gray, below name).
  - **Last charged:** Date of the most recent occurrence (e.g. "Last charged Feb 15") when available.
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
- **Response shape (suggested):**
  ```json
  {
    "payments": [
      {
        "stream_id": "...",
        "merchant_name": "Netflix",
        "frequency": "MONTHLY",
        "average_amount": 22.99,
        "last_amount": 22.99,
        "predicted_next_date": "2026-03-12",
        "status": "MATURE"
      }
    ]
  }
  ```
- **Error handling:** If an item returns e.g. `PRODUCT_NOT_READY` or recurring not enabled, skip that item and continue with others; return whatever streams were returned. Optionally log and surface a generic message if no items support recurring.

### 2.2 Plaid product configuration

- In the Plaid Dashboard, ensure **Recurring Transactions** (or Transactions product including recurring) is enabled for the application.
- No new DB tables are required; this is a live call to Plaid per request (or optionally cached with a short TTL if needed later).

---

## 3. Frontend

### 3.1 New component: `UpcomingRecurringPayments`

- **Location:** e.g. `src/components/UpcomingRecurringPayments.jsx` (or under `src/pages/` if you prefer to keep dashboard-specific blocks in the page).
- **Props:** Optional `getToken` (or use existing auth pattern) for `apiFetch`. Can accept `className` for layout.
- **Behavior:**
  - On mount, call `GET /api/plaid/recurring`.
  - **Loading:** Show a simple loading state (e.g. "Loading recurring payments…" or skeleton rows).
  - **Empty:** If `payments.length === 0`, show a short message (e.g. "No upcoming payments" or "Link accounts to see recurring charges").
  - **List:** Map `payments` to rows matching the reference:
    - **Logo/icon:** First letter of `merchant_name` in a circle (simple, no API dependency). If Plaid adds or exposes `logo_url` on recurring streams later, use that for the image and keep the letter as fallback.
    - **Name:** `merchant_name`.
    - **Frequency:** Map `frequency` to human text (e.g. MONTHLY → "Every month", WEEKLY → "Every week", ANNUALLY → "Every year").
    - **Cost:** Format `last_amount` or `average_amount` as currency (e.g. `$22.99`).
    - **Due:** Compute "in X days" from `predicted_next_date` vs today; for today use "Today", for past (shouldn't happen often) "Overdue" or "X days ago".
  - **Header:** "Upcoming Recurring Payments"; right side: menu (three dots) if you want actions later (e.g. "Manage" or "Refresh").
- **Styling:** Reuse the same card style as other dashboard modules (e.g. `rounded-[14px] border border-[#e5e7eb] bg-white`), consistent typography (e.g. Inter), and a fixed height with `overflow-y-auto` on the list so the module has a "natural bottom" like the transactions module.

### 3.2 Layout (current)

- The **2-column module** in the middle row (below Spending, next to the 3-column module) already exists in `LoggedInPage.jsx` with the title "Upcoming Recurring Payments" and an empty state.
- **Implementation:** Replace the placeholder content inside that 2-column card with the `UpcomingRecurringPayments` component (or inline the list when there is no separate component). The component can be rendered as the card body; the card wrapper and title are already in place.
- Give the list area a fixed height and `overflow-y-auto` so the card doesn’t grow indefinitely and scrolls when there are many items.

---

## 4. Optional enhancements (later)

- **Dedicated page:** `/app/recurring-payments` with full list and history.
- **Caching:** Short-lived cache (e.g. 15–30 min) for `GET /api/plaid/recurring` to avoid calling Plaid on every dashboard load.
- **Merchant logos:** If Plaid provides `logo_url` in the recurring response (or via Enrich/Transactions), use it for the row image and keep the letter circle as fallback when missing.
- **Menu actions:** From the three-dot menu, "Refresh" or "Don't show this payment" (would require storing user overrides).

---

## 5. Implementation order

1. **Backend:** Add `GET /api/plaid/recurring`; for each user item call Plaid recurring API, merge outflows with `predicted_next_date`, sort, return `payments`.
2. **Frontend component:** Create `UpcomingRecurringPayments`, fetch from `/api/plaid/recurring`, handle loading/empty, render list with icon, name, frequency, cost, "in X days".
3. **Dashboard:** In `LoggedInPage.jsx`, replace the 2-column card body with `UpcomingRecurringPayments` (or its list content); set a fixed height + scroll for the list.
4. **Polish:** Menu, frequency labels, and empty-state copy.

---

## 6. Files to touch

| Area        | File(s) |
|-------------|---------|
| Backend     | `server/routes/plaid.js` (new route `GET /recurring`) |
| Frontend    | New `src/components/UpcomingRecurringPayments.jsx` (or equivalent) |
| Layout      | `src/pages/LoggedInPage.jsx` (render component inside existing 2-column card) |
| Config      | Plaid Dashboard: ensure Recurring Transactions (or Transactions with recurring) is enabled |

No new migrations or DB changes are required for the initial version.
