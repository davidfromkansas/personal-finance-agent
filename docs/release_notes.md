# Release notes

User-facing changes, most recent first.

---

# Transactions page overhaul and faster account connections — Shipped: March 13, 2026

## More transaction history on new connections

When you link a new bank account, Crumbs now requests up to 24 months of transaction history from Plaid (previously it used the default, which varies by institution). The extra history fills in automatically in the background — you don't have to do anything.

## Connecting an account no longer blocks the dashboard

Previously, adding a new account would wait for the full transaction sync to complete before letting you continue. Now the sync happens in the background while the dashboard stays responsive. The connections list shows when a sync is in progress; charts and transactions refresh automatically once it finishes.

## Transactions page defaults to the last 30 days

Opening the Transactions page now starts with the last 30 days of transactions rather than an arbitrary batch of 50. This gives you a meaningful default view that aligns with how most people check their spending.

## Smarter filters

- **Date range filter now works correctly.** Setting a start date and end date filters to exactly that window — a bug was causing the end date to be ignored in some cases.
- **Filter panel loads instantly.** Account and category options in the filter panel now come from your local transaction data instead of a live Plaid balance call, so the list appears immediately rather than after a network round-trip.
- **Empty state is clearer.** If filters produce no results, you see a "No transactions match your filters" message with a one-click button to clear them. If you genuinely have no transactions, you see a different message.
- **Sort button has a clearer icon.** The sort toggle button now uses a proper two-way sort icon.

---

# Transaction details, logos, and spending drill-down — Shipped: March 12, 2026

## Transaction detail panel

Click any transaction row — on the dashboard, the Transactions page, or anywhere else — to open a full-detail side panel. The panel shows everything Crumbs knows about that transaction:

- **Merchant info**: name, logo, website link, payment channel
- **Categories**: primary Plaid category, detailed sub-category, and Plaid's confidence level (High / Medium / Low)
- **Counterparties**: the businesses or people on the other side of the payment, with their logos, type (e.g., merchant, financial institution), and websites
- **Payment details**: reference number, processor, payer/payee names, reason, and check number for check payments
- **Location**: city, region, country, and — when a street address isn't available — a clickable Google Maps link using lat/lon coordinates

All fields are always shown. If Plaid doesn't return a value, the field displays `—` so you always see what data exists.

## Merchant logos everywhere

Transaction rows now show a logo next to every transaction. If Plaid provides a logo directly, we use that. Otherwise we fall back to the merchant's favicon (fetched from their website). If no logo is available at all, a circle with the merchant's initial is shown instead — so every row always has a visual indicator.

## Spending chart drill-down

Click any bar in the spending chart (weekly, monthly, or yearly view) to open a panel showing the individual transactions that make up that bar. You can click directly on a bar or on the empty space above it. The panel uses the same layout as the transaction list so the experience is consistent.

## Spending chart uses transaction date

Spending bars now bucket transactions by the date the transaction actually occurred (the authorized/posted date) rather than the date Plaid first reported it. This means your spending totals line up with when you actually spent the money.

---

# AI spending assistant (beta) — Shipped: March 12, 2026

## Ask questions about your money

There's now a lightbulb button in the top-left corner of the app. Click it to open the Crumbs AI assistant — a chat interface where you can ask plain-English questions about your spending and transactions.

Examples of what you can ask:
- "What were my biggest purchases last month?"
- "How much did I spend on food in February?"
- "Did I spend more in January or February?"
- "Show me all my Amazon transactions this year."

The assistant has access to your real transaction data and answers based on what's actually in your accounts. It understands time periods like "this month," "last week," and custom date ranges. Refunds are automatically netted against charges — so if you returned something, the numbers reflect that.

**This is an early beta.** The assistant is limited to spending and transaction questions for now. Balance lookups, investments, and net worth are coming in a later update.

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
