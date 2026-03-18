# Cash Flow Chart — Implementation & Plan

## What it shows

Monthly inflows (money in) and outflows (money out) as paired bars, with a net line connecting each month's result. The header shows the current month's net. The goal is to give the user a simple answer to "am I saving money each month?"

---

## Current implementation

### Data source

Reads from the `transactions` table — same data as Recent Transactions and the Spending chart. No separate aggregation table; computed fresh on each request.

### Backend — `getMonthlyCashFlow` (`server/db.js`)

```sql
SELECT to_char(date_trunc('month', COALESCE(authorized_date, date)), 'YYYY-MM') AS month,
       SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS inflows,
       SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS outflows
FROM transactions
WHERE user_id = $1
  AND (personal_finance_category_detailed IS NULL
       OR personal_finance_category_detailed != ALL($3))
GROUP BY date_trunc('month', COALESCE(authorized_date, date))
ORDER BY month DESC
LIMIT $2
```

- **Plaid sign convention:** positive amount = money out (expense); negative amount = money in (income)
- **Inflows:** `amount < 0` rows, summed as ABS
- **Outflows:** `amount > 0` rows, summed as-is
- **Net:** computed client-side as `inflows - outflows`
- Uses `COALESCE(authorized_date, date)` — prefers authorized date for more accurate month bucketing
- Returns up to 24 months, ordered DESC (frontend reverses to chronological)

### Route — `GET /api/plaid/cash-flow`

- `?months=N` — number of months to return (1–24, default 12, frontend requests 24)
- Returns `{ months: [{ month, inflows, outflows, net }] }`

### Frontend — `src/components/CashFlowChart.jsx`

- **Time window:** Always renders **YTD only** (Jan → current month of current year), even though the backend supports 24 months. Empty months are filled with zeros so the full year is always visible.
- **Chart type:** `ComposedChart` — inflow bars up, outflow bars mirrored below zero axis (`negativeFlow = -(outflows)`), net as a line
- **Y-axis:** Symmetric domain computed from data extremes + 5% padding, snapped to round increments ($500, $2k, $5k etc.)
- **Colors:** Blue (#1e40af) for inflows, orange (#ea580c) for outflows — colorblind-friendly

---

## What's included and excluded

| Type | Included | Reason |
|------|----------|--------|
| Income & deposits | ✅ Inflow | Legitimate money in |
| Purchases & payments | ✅ Outflow | Legitimate money out |
| Loan payments (mortgage, auto, personal) | ✅ Outflow | Real cost |
| Transfers between linked accounts | ❌ Excluded | Would double-count inter-account moves as both inflow and outflow |
| Credit card payments | ❌ Excluded | Would double-count individual transactions already captured on the card |
| Line of credit payments | ❌ Excluded | Same reason |
| Credit card "Payment Thank You" (on card account) | ❌ Excluded | Mirror of the credit card payment on the checking side — both sides excluded to prevent false inflow |

Exclusion is implemented via `NON_SPENDING_DETAILED_CATEGORIES` on `personal_finance_category_detailed`.

---

## Known limitations

### ~~1. Inter-account transfers are double-counted~~ ✅ Fixed
`TRANSFER_IN` and `TRANSFER_OUT` are now excluded from `getMonthlyCashFlow` via `CASH_FLOW_EXCLUDED_CATEGORIES`.

### 2. YTD-only view — no multi-year or rolling window
The frontend hard-codes Jan → current month of the current year. The backend supports up to 24 months but that data is unused. Users can't see last year or a trailing 12-month view.

**Fix:** Add a year selector or a "Last 12 months / This year" toggle. Backend already supports it; frontend change only.

### 3. No account filtering
The spending chart has account filter pills. Cash flow has none — it always shows all accounts. If a user wants to see cash flow for just one institution, they can't.

**Fix:** Pass `account_ids` filter to `getMonthlyCashFlow` (same pattern as `getSpendingSummaryByAccount`).

### 4. Unlinked credit card spending gap
Credit card payments are excluded to prevent double-counting. If a user pays a credit card that is NOT linked in Plaid, the payment is excluded and those purchases are invisible. See `ACCOUNT_CONNECTION_FLOW.md` → Known Limitations.

### 5. Plaid miscategorization causes excluded transactions to slip through *(accepted, documented)*
Our exclusion logic depends entirely on Plaid's `personal_finance_category` and `personal_finance_category_detailed` fields. When Plaid assigns Low confidence and falls back to `OTHER / OTHER`, excluded transaction types (e.g. credit card payments) are not caught and appear in cash flow totals.

**Example:** A "CHASE CREDIT CRD" payment from a 360 Checking account was categorized as `OTHER / OTHER` (Low confidence) instead of `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`. It appeared as an outflow despite credit card payments being excluded.

There is no safe programmatic fix — name-pattern matching would be too fragile and could silently exclude unrelated transactions (violates surgical solutions principle).

**Future fix:** Allow users to manually override a transaction's category. A user-set category would take precedence over Plaid's, enabling them to flag miscategorized transactions so they are correctly excluded from cash flow and spending totals.

### 6. Pending transactions *(accepted, documented)*
Pending transactions are included in monthly totals using their `date` (no `authorized_date` yet). When they settle, two things can happen silently:
- They receive an `authorized_date` in a different month → transaction moves to a different month's bucket
- Their category changes on settlement → they may shift from outflow to excluded (or vice versa)

This means past months' totals can change slightly after settlement with no indication to the user. Accepted as a known limitation for now — the impact is typically small (pending transactions settle within 1–3 days) and fixing it would require either excluding all pending transactions from totals (undercounts current month) or adding a "may change" indicator on affected months.

---

## Open questions

- Should we show a savings rate (net / inflows × 100) in the header or tooltip?
- Multi-year: year selector or trailing 12 months? YTD resets to near-zero in January which can look misleading.
- Current month is always incomplete — should we label it "MTD" or dim it to set expectations?

---

## Potential improvements (not committed)

- **Exclude TRANSFER_IN / TRANSFER_OUT** to eliminate inter-account noise
- **Year selector** — show this year, last year, or trailing 12 months
- **Account filter** — same filter pills as Spending chart
- **Savings rate** — show `net / inflows` as a percentage in the header
- **CSV export** — monthly breakdown table for the current view
