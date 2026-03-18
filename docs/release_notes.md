# Release notes

User-facing changes, most recent first.

---

# Cash flow drill-down and accuracy improvements — Shipped: March 18, 2026

## Click any month to see a breakdown of inflows and outflows

Clicking a bar (or anywhere in a month column) on the cash flow chart opens a side panel showing all transactions for that month, split into Inflows and Outflows columns. Click any transaction to open the full transaction detail panel.

## Credit card payment receipts no longer inflate inflows

When you pay a credit card that is linked in Plaid, the credit card account records a "Payment Thank You" transaction. This was previously counted as an inflow, making it appear as if you received income. These transactions (categorized as `LOAN_DISBURSEMENTS`) are now excluded from both cash flow and the spending chart — the same treatment already applied to the payment from the checking account side.

## Cash flow and spending exclusions are more transparent

Both the cash flow chart and spending chart now have an info button (ⓘ) that explains exactly what is included and excluded. The current month's bars are shown with a dashed outline to indicate the data is still incomplete.

---

# Account connection improvements and data accuracy — Shipped: March 17, 2026

## Loan payments and rent now show in spending

Loan payments and rent/utilities were previously excluded from the spending chart. They are now counted as real cash outflows, consistent with how popular finance dashboards (Mint, YNAB, Copilot) treat them. Transfers between your own accounts are still excluded to avoid double-counting.

## Duplicate institution connections are now blocked

If you try to add a bank you've already connected, the app now detects the duplicate and shows a clear message instead of creating a second connection that would double-count your net worth. If you want to add accounts you previously skipped (e.g., adding a 401k to an existing Chase connection), the app offers an "Update connection" button that opens your existing connection in Plaid's update mode — no duplicate created.

## Charts now update when you connect or disconnect an account

After connecting, reconnecting, refreshing, or disconnecting an account, all charts (spending, net worth, investments, cash flow) now refresh automatically. Previously, some charts (investments, portfolio history) were not included in the post-connect refresh and required a manual page reload to reflect the change.

## Disconnecting an account clears all its data immediately

When you disconnect an account, the following are now deleted together: transactions, account balance history, investment holdings history, portfolio snapshots, and investment transactions. Previously only transactions were deleted, leaving orphaned historical data in the database.

## Connected accounts now show which data was granted

Each connection on the dashboard now shows badges indicating whether Plaid granted access to **Transactions**, **Investments**, or both. This is populated for new connections going forward; existing connections will show the badges after they are reconnected.

See the full plan: [ACCOUNT_CONNECTION_FLOW.md](docs/ACCOUNT_CONNECTION_FLOW.md) · [ACCOUNT_DISCONNECTION_FLOW.md](docs/ACCOUNT_DISCONNECTION_FLOW.md)

---

# Faster navigation, instant data, and skeleton loading — Shipped: March 14, 2026

## App feels instant when switching pages

All data-fetching has been migrated to [TanStack Query](https://tanstack.com/query) with a shared cache ([full plan](docs/STATE_MANAGEMENT_PLAN.md)). Charts, accounts, transactions, investments, and upcoming payments are now cached in memory — switching between pages shows your data immediately instead of spinning each time. Data stays fresh automatically in the background.

## Optimistic UI for disconnect and refresh

Disconnecting an account removes it from the list immediately — no waiting for the server to confirm. Refreshing a connection marks it as syncing right away. If either action fails, the list snaps back to what it was before. Both feel instantaneous.

## Skeleton loading instead of spinners

Every section that loads data now shows a skeleton placeholder — gray pulsing shapes matching the real content layout — instead of a blank space or "Loading…" text. Accounts, investments, upcoming payments, and the transaction list on the dashboard all have skeletons.

## Cash flow chart is now year-to-date

The cash flow chart always shows January through the current month of the current year. Previously it showed a rolling window of the last 4 months. Any month with no transaction data appears as a zero bar so the full year-to-date picture is always visible.

## Dashboard transaction list no longer double-loads

On the dashboard, the recent transactions list was briefly showing content, then re-spinning on every page load. Fixed — background syncs now refresh silently without toggling the loading state.

---

# Transactions page overhaul and faster account connections — Shipped: March 13, 2026

## More transaction history on new connections

When you link a new bank account, Crumbs now requests up to 24 months of transaction history from Plaid (previously it used the default, which varies by institution). The extra history fills in automatically in the background — you don't have to do anything.

## Connecting an account no longer blocks the dashboard

Previously, adding a new account would wait for the full transaction sync to complete before letting you continue. Now the sync happens in the background while the dashboard stays responsive. The connections list shows when a sync is in progress; charts and transactions refresh automatically once it finishes.

## Transactions page defaults to the last 30 days

Opening the Transactions page now starts with the last 30 days of transactions rather than an arbitrary batch of 50. This gives you a meaningful default view that aligns with how most people check their spending.

## Sort and filter transactions

The Transactions page now has a full filter and sort panel:

- **Filter by account** — show transactions from one or more of your linked accounts.
- **Filter by category** — narrow down to specific spending categories (e.g., Food & Drink, Travel, Shopping).
- **Filter by date range** — pick a preset (Last 7 days, Last 30 days, Last 3 months, This year) or set a custom start and end date.
- **Active filter pills** — any active filters appear as dismissible pills below the header so you always know what's being applied and can remove individual filters in one click.
- **Sort order** — toggle between newest-first and oldest-first using the sort button.

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
