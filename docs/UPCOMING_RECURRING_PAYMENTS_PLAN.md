# Upcoming Payments — Implementation & Plan

## What it shows

Recurring charges and credit card bills due in the future, sorted soonest first. Gives the user a forward-looking view of committed cash outflows.

---

## Current implementation

### Data sources

Two Plaid APIs called in parallel per connected item:

1. **`transactionsRecurringGet`** — Plaid's recurring transaction detection. Returns `outflow_streams`: merchant name, frequency, average/last amount, and a `predicted_next_date`. Plaid infers these from transaction history — it detects patterns and predicts the next charge. Streams with no `predicted_next_date` or status `TOMBSTONED` are skipped.

2. **`liabilitiesGet`** — Credit card bill data. Returns the actual `next_payment_due_date` and `minimum_payment_amount` directly from the bank (not inferred).

### Route — `GET /api/plaid/recurring`

- Calls both APIs per item concurrently (`Promise.allSettled`), all items concurrently (`Promise.all`)
- Merges results into a flat list, filters to `predicted_next_date >= today` (stale past predictions excluded)
- Sorts by `predicted_next_date` ascending (soonest first)
- Enriches logo URLs from DB (matched via `first_transaction_id` of each stream)
- Returns `{ payments: [...] }`

### Frontend — `src/components/UpcomingPayments.jsx`

- Paginated list (5 per page) with skeleton loading
- Amount shown: `last_amount` if available, otherwise `average_amount`
- Due date label: "Today", "Tomorrow", "in X days" for near dates; readable date (e.g. "Dec 1, 2026") for dates > 30 days out
- Credit card bills show "Credit card bill" as subtitle instead of frequency
- Info button (ⓘ) in card header explains what's included

### Stream statuses

| Status | Shown |
|--------|-------|
| `MATURE` | ✅ Yes |
| `EARLY_DETECTION` | ✅ Yes |
| `PAUSED` | ✅ Yes (see known limitations) |
| `TOMBSTONED` | ❌ Filtered out |
| `UNKNOWN` | ✅ Yes |

---

## What's included and excluded

| Type | Included | Reason |
|------|----------|--------|
| Recurring outflow streams with a future predicted date | ✅ | Core purpose |
| Credit card bills (next due date + minimum payment) | ✅ | Direct from bank |
| Streams with past predicted dates | ❌ | Stale — excluded server-side |
| `TOMBSTONED` streams | ❌ | Plaid considers these ended |
| Inflow streams (income, deposits) | ❌ | Not outflows |

---

## Known limitations

### 1. Cancelled subscriptions stay visible until Plaid detects the cancellation

When a user cancels a subscription, Plaid has no direct signal. It only infers cancellation from missed charges over time. Until Plaid updates the stream status to `PAUSED` or `TOMBSTONED`, the cancelled subscription continues to appear with a future predicted date that will never arrive.

Timeline: at least one missed billing cycle, possibly 2–3. For annual subscriptions this could mean the item stays visible for up to a year.

**Accepted limitation.** Future fix: allow users to manually dismiss or mark a stream as cancelled. This requires storing user overrides in our DB (same class of problem as user-editable transaction categories).

### 2. PAUSED streams are shown

Plaid marks a stream `PAUSED` when it detects missed charges but isn't certain the subscription is ended. We currently show `PAUSED` streams because hiding them could silently drop active subscriptions that just had a gap (e.g. a service paused during a free trial or billing error). However, some `PAUSED` streams may be genuinely cancelled.

**Accepted for now.** Revisit if user complaints arise about seeing cancelled subscriptions.

### 3. Credit card bills show minimum payment only

The `minimum_payment_amount` from Plaid's liabilities API is the legally required minimum, not the full balance. Users who pay in full each month will see a lower amount than what they'll actually pay.

**Accepted.** Plaid provides the full balance separately — could be added as a secondary line in a future update.

### 4. Amount is last_amount, not a guaranteed future amount

For recurring streams, we show `last_amount` (most recent charge) as the expected amount. The actual next charge may differ (price changes, usage-based billing, annual renewal at a different rate).

**Accepted.** This is Plaid's prediction model — we surface what we have.

### 5. Predictions can be stale within the future window

We filter out past dates, but a prediction that is technically in the future could still be stale if the subscription billing cycle shifted and Plaid hasn't caught up. No practical fix without Plaid updating the stream.

---

## Potential improvements (not committed)

- **User dismissal** — let users mark a stream as cancelled so it stops appearing
- **Show full balance** — for credit card bills, show the full statement balance alongside the minimum
- **PAUSED badge** — visually indicate streams Plaid thinks may be inactive
- **Refresh button** — let users force a re-fetch from Plaid
