# Release notes

User-facing changes, most recent first.

---

# Investment portfolio value — Shipped: March 7, 2026

## Current portfolio value

The Investments page now shows your live total investment portfolio value, updated each time you load the page. This pulls your current holdings directly from your linked brokerage accounts via Plaid and sums up the broker-reported value across all accounts.

## Historical chart: coming later

The chart currently shows your portfolio value from today forward. We're not showing historical data yet. Plaid doesn't provide a historical portfolio value API — to show the past we'd have to reconstruct your daily portfolio balance ourselves by combining your transaction history with 3rd party price data, which is too unreliable to show with confidence. As your data accumulates day by day, the chart will fill in naturally over time.

---

# Font and data security updates — Shipped: March 5, 2026

## JetBrains Mono font across the app

The entire app—landing page, dashboard, charts, and all text—now uses the JetBrains Mono font for a consistent, readable look. This applies everywhere you see type in the product.

## Plaid webhook signature verification

When Plaid sends us a notification that new transactions are available, we now verify that the notification really came from Plaid before we update your data. This prevents fake or spoofed requests from triggering unnecessary updates. You don't see any change in the app; your data stays as secure and reliable as before, with an extra check behind the scenes.

## Fresher balances and automatic transaction updates

Account balances (connections list, accounts page, and net worth chart) now use Plaid's real-time balance API so the numbers you see are as up to date as Plaid has. We also added Plaid webhooks: when Plaid gets new transactions from your bank, they notify us and we sync in the background, so the next time you open the dashboard you see newer data without tapping Refresh. When you do tap Refresh, we ask Plaid to check your bank right then so updates can appear as soon as possible.

## Credit card payments excluded from spending

Paying your credit card is now correctly treated as moving money, not as new spending. We exclude Plaid's "transfer" and "loan payment" categories from spending totals, so your credit card payment doesn't inflate your spending charts. This is documented in the project README for future reference.

---

# Cash flow and upcoming payments — Shipped: March 4, 2026

## Cash flow chart

A new cash flow section on the dashboard shows monthly income (inflows) and spending (outflows) as blue and orange bars, with a net line so you can see whether each month was positive or negative. The chart uses a colorblind-friendly blue-and-orange palette, adjusts the vertical scale to fit your data, and shows a small bar even when a month has zero inflow or outflow so both categories are always visible. Data comes from the same transaction history as your recent transactions.

## Upcoming Payments (renamed, with credit card bills)

The recurring payments list was renamed to "Upcoming Payments" and now includes credit card bills (due dates and minimum amounts from your linked accounts) alongside other recurring outflows. Rows show in full with no cut-off, and we use pagination so you can move through the list in clear pages.

---

# Transactions list improvements — Shipped: March 3, 2026

## Transactions: full rows and variable page size

The recent transactions list now shows complete rows with no scrolling or cut-off within the list. We show as many transactions as fit on the screen and use pagination (with "Older" / "Newer") so you can move through your history. The list height matches the content so the layout stays clean.

---
