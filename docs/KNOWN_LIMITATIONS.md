# Known Limitations

Documented limitations, data accuracy caveats, and edge cases. These are either inherent to upstream data providers (Plaid, Yahoo Finance) or architectural trade-offs we've chosen to accept.

---

## Plaid Data

### Recurring transaction dates use post date, not charge date

Plaid's `transactionsRecurringGet` returns `last_date` based on when the transaction was posted by the bank, not when the charge was actually authorized. Credit card charges typically post 1-2 days after the real charge date. This means "Last Charged" dates in the Recurring Payments calendar can be off by a day or two.

**Example:** Cursor subscription charged on March 11 shows as March 12 in the app.

**Workaround (not implemented):** Cross-reference with the transaction's `authorized_date` field, which reflects the actual charge date. This would require additional lookups per recurring stream.

### PRODUCTS_NOT_SUPPORTED errors are silently skipped

When Plaid returns `PRODUCTS_NOT_SUPPORTED` for an institution (e.g., Venmo, Capital One for investments), the connection is silently skipped during data collection. The user is not informed that their institution doesn't support a particular product. This affects `snapshotInvestments`, `snapshotBalances`, and recurring transaction fetches.

Other silently skipped error codes: `NO_INVESTMENT_ACCOUNTS`, `CONSENT_NOT_GRANTED`, `ADDITIONAL_CONSENT_REQUIRED`, `INSTITUTION_DOWN`, `INSTITUTION_NOT_RESPONDING`.

### Balance fallback on rate limiting

When Plaid returns `BALANCE_LIMIT`, the system falls back from `accountsBalanceGet` (real-time) to `accountsGet` (Plaid-cached, slightly stale). Balance snapshots taken during rate-limited periods may be less fresh than expected. This is logged server-side but not surfaced to the user.

### Cost basis is often missing

Many institutions don't provide cost basis data to Plaid. When missing, gain/loss calculations on the Investments page show $0 or are omitted. This is an institution-level limitation — there's no way to backfill cost basis without manual entry.

### Recurring payment frequency approximations

Plaid uses fixed day counts for frequency predictions: Weekly = 7 days, Biweekly = 14, Semi-monthly = 15, Monthly = 30, Quarterly = 91, Yearly = 365. Semi-monthly payments (1st and 15th, for example) may drift. Monthly payments may shift forward over months with 31 days or backward in February.

---

## Investment Data

### Market hours are US-only and hardcoded

Market open/close detection assumes US equity market hours (9:30 AM - 4:00 PM ET). Pre-market and after-hours trading are filtered out from intraday charts. International markets and crypto are not considered.

### Market holidays are hardcoded through 2026

US market holidays are hardcoded for 2025-2026. After December 2026, holidays need manual updates. Emergency market closures (circuit breakers, weather) are not detected.

### Yahoo Finance intraday data gaps

If Yahoo Finance returns no intraday data for a ticker, that ticker's contribution is missing from the 1D portfolio chart. This can happen for thinly traded securities, OTC stocks, or during Yahoo Finance outages. The portfolio value shown may be lower than actual.

### Live portfolio value excludes errored connections

During market hours, the live portfolio value comes from Plaid's `investmentsHoldingsGet`, which only returns data for healthy connections. If a brokerage connection has an error (e.g., `ITEM_LOGIN_REQUIRED`), those holdings are excluded from the live total but may be included in snapshot-based values (since the snapshot was taken before the error occurred).

---

## Net Worth

### Investment accounts excluded from balance snapshots

Investment account values come exclusively from `portfolio_account_snapshots` (via `snapshotInvestments`). They are deliberately excluded from `account_balance_snapshots` to prevent double-counting. If investment snapshots fail but balance snapshots succeed, investment values will be missing from net worth for that day.

### Historical data starts from first snapshot

Net worth and portfolio charts only show data from the date snapshots started being collected. There is no backfill of pre-connection balances for depository/credit/loan accounts. Investment portfolio history is backfilled using historical prices, but only for holdings that existed at the time of connection.

---

## General

### Snapshot timing

Daily snapshots are taken at 4:29 PM ET (with a retry at 5:00 PM ET). For investment accounts, this is approximately market close. For bank accounts, this captures the balance at that moment — intraday deposits or payments after 4:29 PM won't be reflected until the next day's snapshot.

### Timezone assumptions

Snapshot dates are calculated in US Eastern time and stored as `YYYY-MM-DD` strings. Users in other timezones may see dates that don't align with their local calendar day.

### Account type fallback

If Plaid doesn't return an account type, it defaults to `other`. This could cause accounts to be miscategorized in net worth calculations (assets vs. liabilities).
