# Spending Chart — Implementation & Plan

## What it shows

Spending broken down by account, across Daily (last 7 days), Weekly (last 4 weeks), and Monthly (last 12 calendar months) views. Stacked bars per account, clickable to drill into individual transactions.

---

## Current implementation

### Data source

Reads from the `transactions` table. Aggregated server-side by `getSpendingSummaryByAccount` (`server/db.js`).

### Backend — `getSpendingSummaryByAccount`

```sql
SELECT <bucket_expr> AS bucket,
       COALESCE(account_name, 'Unknown') AS account_name,
       SUM(amount) AS total
FROM transactions
WHERE user_id = $1
  AND <date_filter>
  AND (personal_finance_category IS NULL OR personal_finance_category != ALL($NON_SPENDING_CATEGORIES))
  AND (personal_finance_category_detailed IS NULL OR personal_finance_category_detailed != ALL($NON_SPENDING_DETAILED_CATEGORIES))
GROUP BY <bucket_expr>, account_name
ORDER BY bucket ASC, account_name ASC
```

- **Plaid sign convention:** positive amount = money out (expense); negative amount = money in (refund/income)
- **`SUM(amount)` nets refunds against purchases** — a $100 purchase and $30 refund in the same bucket shows $70
- **Negative buckets clamped to 0** in the route — if refunds exceed purchases in a period, bar shows $0
- Category exclusions filter out income, transfers, and bank fees (not refunds — see below)

### Bucket groupings

| Tab | Period key | Grouping | Date window |
|-----|-----------|----------|-------------|
| Daily | `week` | Calendar day | Last 7 days |
| Weekly | `month` | ISO week (Mon–Sun) | Last 28 days |
| Monthly | `year` | Calendar month | 11 months ago (1st) → today |

Monthly uses a **month-aligned start date** (`date_trunc('month', now) - 11 months`) so each bar represents a complete Jan 1–Jan 31 window, not a rolling 365-day cutoff.

### Route — `GET /api/plaid/spending-summary`

- `?period=week|month|year`
- `?account_ids=id1,id2,...` — optional account filter
- Returns `{ period, accounts, buckets: [{ label, date, [accountName]: total, ... }] }`

### Frontend — `src/components/SpendingCharts.jsx`

- Three tabs: Daily / Weekly / Monthly
- Stacked bars per account with stable color assignment (keyed by `allAccounts` order from connections, not `activeAccounts` from current period — prevents color/stack order shifting between tabs)
- Clickable bars → `SpendingDrillPanel` showing individual transactions
- Account filter legend (pill toggles)

---

## What's included and excluded

| Type | Included | Reason |
|------|----------|--------|
| Purchases & payments | ✅ Net spending | Positive amounts summed per bucket |
| Merchant refunds / returns | ✅ Netted out | Negative amounts on spending-category transactions reduce the bucket total |
| Income & deposits | ❌ Excluded | `INCOME` primary category |
| Transfers | ❌ Excluded | `TRANSFER_IN`, `TRANSFER_OUT` primary categories |
| Bank fees | ❌ Excluded | `BANK_FEES` primary category |
| Credit card payments | ❌ Excluded | `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` detailed category |
| Line of credit payments | ❌ Excluded | `LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT` detailed category |
| Credit card "Payment Thank You" | ❌ Excluded | `LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT` detailed category |

### Why category filter, not amount filter

The original implementation used `AND amount > 0` which accidentally excluded refunds (negative spending-category amounts) alongside income (also negative). This overcounted spending by ignoring returns.

The fix uses category-based exclusion instead — same logic as the chart — so:
- Income/transfers are still excluded (their primary categories are in `NON_SPENDING_CATEGORIES`)
- Refunds are included and netted (spending-category transactions with negative amounts pass through)

The drill panel mirrors this exactly: `.filter(t => !NON_SPENDING.includes(t.personal_finance_category))` instead of `.filter(t => t.amount > 0)`. Refunds display in green with `+$X.XX`.

### Residual risk

If Plaid miscategorizes a non-spending transaction (e.g. a paycheck) with a spending-type primary category, it would incorrectly reduce the spending total. This is the same Plaid miscategorization risk documented in `CASH_FLOW_PLAN.md` Known Limitation #5. Future fix: user-editable transaction categories.

---

## Known limitations

### 1. Cross-period refund timing
A refund in a different period than the original purchase reduces that period's spending (correctly — that's when cash moved) without a matching purchase visible in the same view. This is correct behavior but may be surprising to users.

### 2. Plaid miscategorization (accepted, documented)
Same as cash flow. If Plaid assigns `OTHER/OTHER` (Low confidence) to a non-spending transaction with a negative amount, it slips through category filtering and falsely reduces the spending total. Future fix: user-editable categories (see `project_transaction_category_overrides.md` in memory).

### 3. No savings rate or budget comparison
The chart shows gross spending per period but no comparison to a budget or prior period average.

### 4. Weekly bars can span two calendar months
ISO week grouping means a bar labeled "Feb 23–Mar 1" contains spending from two calendar months. This is displayed correctly in the label but may be unexpected.

---

## Potential improvements (not committed)

- **Budget overlay** — show a horizontal line for monthly budget target
- **Period-over-period comparison** — e.g. this month vs last month
- **Category breakdown** — instead of (or in addition to) account breakdown, show spending by Plaid category
- **CSV export** — transaction list for the current drill-down
