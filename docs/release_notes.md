# Release notes

User-facing changes, most recent first.

---

# New domain — Shipped: April 2, 2026

Abacus is now served from **getabacus.xyz**. The CLI default server URL has been updated accordingly. Existing users with a saved config will continue to work — the new default only applies to fresh logins.

---

# CLI polish, investment connect button, and reconnect fix — Shipped: March 31, 2026

## Abacus CLI: branded terminal experience

The `abacus` CLI now opens with a full branded experience:

- **Animated banner** — block-letter ABACUS logo rendered side-by-side with an animated abacus (13 spindles, 7 bead rows). Beads animate while the terminal is idle and pause during queries.
- **Real-time activity display** — while answering a question, the CLI shows which agent is working and what data it's fetching live (`↳ spending summary`, `↳ transactions`, etc.).
- **Data source summary** — after each answer, shows the exact data sources called per agent and how long they took:
  ```
  ● Spending ("How much did I spend on Uber in January...")
  │  ↳ spending summary
  │  ↳ transactions
  └ Called 2 data sources in 3.4s
  ```
- **Account status on launch** — shows your connected accounts and last synced time when you open the CLI.
- **`help` command** — type `help` inside the REPL to see example questions and available commands.
- **First-run welcome** — new users see starter questions after `abacus login`.

## Investment Portfolio: connect button

When no investment accounts are linked, the Investment Portfolio widget on the dashboard now shows a **Connect investment account** button that opens the Plaid investment flow directly — no need to navigate to the connections panel.

## Reconnect button now appears automatically

When a bank connection expires and requires re-authentication, the **Reconnect** button now appears automatically in the connections list without needing a page reload. Previously, the error state was stored in the database but not read back on page load, so the button only appeared after a manual refresh.

---

# Claude connector and CLI — Shipped: March 29, 2026

## Ask Claude about your finances from anywhere

Crumbs now connects to Claude as an MCP (Model Context Protocol) server. Once connected, you can ask Claude questions about your finances directly in Claude Desktop, Claude.ai (web and mobile), and a new terminal CLI — without opening the Crumbs app.

**Claude Desktop / Claude.ai web + mobile**
Add Crumbs as a connector in Claude.ai Settings → Connectors. Sign in with the same Google account you use for Crumbs. Claude will have access to all your financial data and can answer questions, build charts, and reason across your accounts in the same conversation window you already use.

**Terminal CLI**
Install the CLI and run `copilot` to open an interactive session, or `copilot "question"` for a one-off answer. The CLI remembers your login and maintains conversation history within a session so follow-up questions work naturally.

## Available tools

Claude has access to 10 read-only tools scoped to your account:

- **get_accounts** — balances across all linked bank, credit, loan, and investment accounts
- **get_net_worth** — current net worth snapshot (investments + liquid − liabilities)
- **get_net_worth_history** — daily portfolio value over time for charting trends
- **get_spending_summary** — spending by category for any date range
- **get_transactions** — individual transactions with date, category, and merchant filters
- **get_cash_flow** — monthly inflows, outflows, and net for up to 24 months
- **get_recurring_transactions** — upcoming bills and subscriptions detected by Plaid
- **get_portfolio** — current investment holdings across all brokerage and retirement accounts
- **get_investment_transactions** — trade history (buys, sells, dividends) for a specific account
- **ask_question** — delegates complex multi-step questions to the full AI orchestrator

All data is read-only. Claude cannot move money, modify accounts, or take any action.

---

# Accounts agent, balance snapshots, and trade history — Shipped: March 29, 2026

## AI assistant: Accounts mode

The AI assistant now has an Accounts agent — a specialist for questions about account balances, net worth, credit, and linked institutions. Switch the chat to Accounts mode to ask:

- "What are my current balances?"
- "What's my net worth?"
- "How much available credit do I have?"
- "How has my savings balance changed over the last 3 months?"
- "Which accounts do I have linked?"

The agent tries to return live balance data (from the most recent account fetch), with a fallback to the latest daily snapshot if needed. Net worth combines live depository/credit/loan balances with investment totals computed from actual holdings — the same source used by the portfolio agent — for maximum accuracy.

In Auto mode, the orchestrator now knows about the accounts agent and will route balance and net worth questions to it automatically.

## Net worth chart: switched to snapshot-based data

The net worth chart on the Accounts page now uses daily balance snapshots instead of back-calculating from transaction history. This gives a more accurate picture — investment account values are now computed from actual holdings rather than being flat-lined at the current balance. The chart shows data from the date snapshots started being collected; new users will see "no data for this range" until the first snapshot runs.

## Daily balance snapshots (cron)

Account balances are now snapshotted nightly by the cron job alongside investment snapshots, ensuring the Accounts agent and net worth chart have consistent daily data even on days when you don't open the app. Balances are also still snapshotted whenever you load your accounts (whichever is more recent wins).

## Investments: trade history in account detail panel

The account detail panel on the Investments page now shows a Trade History section listing recent investment transactions (buys, sells, dividends, etc.) for that account.

---

# AI assistant: multi-agent architecture, charts, and investment analysis — Shipped: March 26, 2026

## Orchestrator-workers architecture

The AI assistant has been rebuilt from a single-model endpoint into a multi-agent system. A central orchestrator receives every question and routes it to the appropriate specialist agent — a spending agent for transactions and cash flow, a portfolio agent for investments and holdings. For questions that span both domains (e.g. "how am I doing financially?"), the orchestrator calls both agents in parallel and synthesises a single coherent answer.

Routing is direct: if you're in Transactions or Investments mode, your message goes straight to the right agent without an orchestrator round-trip. Auto mode uses the orchestrator to decide.

## Charts and visualisations in the chat

The assistant can now render interactive charts inline in the conversation. Ask for a chart and you'll get a Recharts component alongside the text answer — not a table or a description of the data.

Supported visualisations:
- **Bar chart** — spending by category
- **Line chart** — portfolio value or single-account spending over time
- **Multi-line chart** — comparing multiple accounts or holdings (e.g. VOO vs PLTR % return)

## Investment analysis tools

The portfolio agent now has two additional tools:

- **Per-ticker performance** — ask how a specific holding (e.g. PLTR) has performed over a date range. The agent retrieves daily price history per ticker per account and computes % return and estimated dollar gain/loss from cost basis, with a caveat if your position size may have changed during the period.
- **Account-filtered portfolio history** — ask about a specific institution (e.g. "my Schwab portfolio") and the agent resolves the correct accounts, then charts performance for those accounts only rather than your full portfolio.

## Markdown tables render correctly in chat

The chat panel now renders markdown tables as proper HTML tables instead of raw pipe characters. Bold text, bullet lists, and other markdown formatting also render correctly throughout the conversation.

## Data quality: stale investment snapshots cleaned up

A previous re-link of a Charles Schwab connection left orphaned rows in the holdings and portfolio snapshots tables. These have been deleted. The account lookup query used by the portfolio agent now filters to active connections only, so this cannot recur.

---

# Investments account detail, net worth explainer, and UI polish — Shipped: March 19, 2026

## Investments: click an account to see full detail

Clicking an account row in the Investments page now opens a slide-in detail panel showing the account's type, current balance, unrealized gain/loss, cost basis, and a full breakdown of every holding in that account. Previously, clicking an account only filtered the performance chart.

## Net worth: "how is this calculated?" explainer

The net worth chart now has an info button (ⓘ) next to the range tabs. Clicking it opens an overlay that explains exactly how net worth is calculated — which assets are added, which debts are subtracted, and what's excluded (like investment accounts, which are tracked separately on the Investments page).

## Transactions page: load 150 most recent by default

The Transactions page now loads your 150 most recent transactions when you open it, with no date filter applied. Previously it defaulted to the last 30 days, which hid older transactions unless you changed the filter.

## Transactions page: separate filter buttons per dimension

The single "Filter" button on the Transactions page has been split into three separate buttons — **Account**, **Date**, and **Category** — each with its own focused dropdown. Active filters fill black so it's immediately clear which dimensions are filtered.

## Transactions page: year shown in date headers

Date group headers on the Transactions page now include the year (e.g. "Tuesday, March 17, 2026") so transactions from previous years are unambiguous.

## Visual polish: consistent border styling across all charts

Border colors are now consistent across all charts, tooltips, drill-down panels, and detail cards throughout the app.

---

# Investments page overhaul — Shipped: March 18, 2026

See the full plan: [INVESTMENTS_PLAN.md](docs/INVESTMENTS_PLAN.md) · [PRODUCT_PRINCIPLES.md](docs/PRODUCT_PRINCIPLES.md)

## Live market status bar

A new bar at the top of the Investments page shows whether the US market (NYSE/NASDAQ) is currently open or closed, with a live clock displaying the current time, date, and timezone. The clock ticks in real time and accounts for weekends and US market holidays through 2026.

## Top Movers — live quotes from Yahoo Finance

A new Top Movers section appears below the market status bar (and between the chart and accounts list on the dashboard). Each card shows the ticker, current price, daily % change, dollar change, and a 52-week range indicator showing where the current price sits between the 52W low and high.

Prices come from Yahoo Finance (~15 min delayed when market is open, final settled prices when closed). The section auto-refreshes every 60 seconds. Context text below the header tells you exactly what the numbers mean: *"Intraday change from previous close · ~15 min delayed"* when open, *"Change from previous close · final prices for the day"* when closed. This is consistent with [Product Principle #2](docs/PRODUCT_PRINCIPLES.md) — transparency about data provenance.

## Asset Allocation donut chart

The Allocation section is now a donut chart. Hovering over any slice (or its legend row) shows the asset category, percentage, and dollar value in the center of the donut — no floating tooltip that blocks the chart. All other slices dim to keep focus on the hovered category. The legend shows two decimal places for precision.

## Accounts list: click to filter the Performance chart

Clicking an account row in the Accounts section filters the Performance chart to show only that account's historical value. Click again to deselect and return to the full portfolio view. A pill badge appears in the Performance header showing which account is active.

## Performance chart: Y-axis auto-scales

The Performance chart Y-axis no longer starts at $0. It auto-scales to the data range so changes are easier to read — a 5% drop doesn't look flat on a chart that goes to $0.

## Your Positions chart: YTD x-axis labels fixed

When the YTD range is selected in the Your Positions chart, x-axis labels now show the full date (e.g. "Jan 5") instead of just the month, so you can tell apart dates within the same month.

## Dashboard: period change is now the primary figure

The Investment Portfolio widget header now shows the change over the selected time range (1W, 1M, 3M, etc.) as the primary figure next to the total value, so the number actually responds to the range filter you pick. The all-time gain from cost basis has been removed to reduce noise.

---

# Spending & cash flow improvements — Shipped: March 18, 2026

## Refunds and returns now reflected in spending

Merchant refunds (returns, credits) are now netted against purchases in the spending chart. A $100 purchase and a $30 refund in the same period shows $70 of net spending instead of $100. Refunds appear in green in the transaction drill-down panel. The cash flow chart already handled this correctly — refunds appear as inflows in the month the money was returned.

## Search and sort in spending and cash flow drill panels

The transaction panel that opens when you click a spending bar or a cash flow month now has a search field and a sort button:

- **Search** — type any part of a merchant name to instantly filter the list. In cash flow, the search filters both the Inflows and Outflows columns at once, and the column totals update to match.
- **Sort** — choose Most recent (default), Oldest first, Most expensive, or Least expensive.

## Weekly spending bars now show date ranges

The Weekly tab in the spending chart now labels each bar with the full date range it covers (e.g. "Feb 23–Mar 1") instead of just the start date.

## Monthly spending bars now align to full calendar months

Each bar in the Monthly tab now represents a complete calendar month (Jan 1–Jan 31, Feb 1–Feb 28, etc.) rather than a rolling window that could clip months at an arbitrary cutoff. Labels show the month and full year (e.g. "Apr 2025") so April 25th and April 2025 are unambiguous.

## Colors updated for colorblind accessibility

Blue now consistently means money in / positive, and red means money out / negative across all charts and panels — spending drill-down, cash flow bars, transaction detail panel, investment gains/losses, and the net worth tooltip. The previous orange color for outflows has been replaced with red throughout.

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
