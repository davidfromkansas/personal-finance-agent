# Release Notes

## 2026-04-10 — Dashboard Polish, Accounts Improvements, Data Accuracy Fixes

### Dashboard
- Removed info button and Organic/Account Changes breakdown from Net Worth module
- Matched Net Worth styling to Investment Portfolio (label, change format)
- Removed Top Movers section from Investment Portfolio module
- Made Net Worth and Investment Portfolio modules equal height
- Moved Net Worth and Investment Portfolio above Spending/Transactions
- Added area chart fill to Net Worth chart
- Fixed footer alignment between Net Worth and Investment Portfolio modules
- Renamed "Add Connection" to "Add Account"

### Accounts Page
- Added connection type modal (Credit Cards vs Investments) when clicking "Add Account"
- Added reconnection UI for accounts with Plaid connection errors (banner + per-account error styling)
- Added "Remove" option for stale/invalid Plaid items
- Investment accounts now show the same detail panel as the Investments page

### Investment Portfolio — Value Accuracy
- Fixed header value not matching chart data by unifying display logic:
  - Market open: header and chart show live Plaid API value (real-time)
  - Market closed: header and chart show latest snapshot value (captured at market close)
- Range change and YTD calculations now use the display value for consistency

### Net Worth — Historical Data Fix
- Fixed inflated historical values caused by investment balances being carried forward as a flat constant
- Created `getInvestmentBalanceHistory` for per-date investment values from `portfolio_account_snapshots`
- Excluded investment-type rows from `account_balance_snapshots` to prevent double-counting

### Server
- Added `Cache-Control: no-store` for all `/api` routes to prevent stale 304 responses
- Fixed Plaid reconnect flow: skip `exchange-token` in update mode, trigger sync instead
- Updated cron route comments to reflect actual snapshot schedule (4:29 PM ET via node-cron)
