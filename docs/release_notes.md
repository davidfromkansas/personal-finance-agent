# Release notes

User-facing changes, most recent first.

---

# Fully client-side demo mode — Shipped: April 15, 2026

## Client-side demo mode (no server required)

Demo mode now runs entirely in the browser with no server, database, or Plaid API calls. Clicking "Try Demo" on the landing page loads a complete fake financial profile for Alex Rivera, a 28-year-old software engineer in NYC, with 12 months of dynamically generated data that stays current relative to today's date.

## Diverse demo data

~1,400 transactions with weekly cadence across NYC merchants: coffee shops, casual dining, date nights, brunch spots, bars, bodegas, grocery stores, rideshares, and more. Includes special events like a girlfriend's birthday, a Japan trip, Valentine's Day, summer concerts, Black Friday, and NYE. 13 recurring subscriptions including rent, Equinox, Netflix, Spotify, Claude Pro, Cursor Pro, and others.

## Investment portfolio

5 brokerage holdings (AAPL, NVDA, MSFT, TSLA, VOO) plus a Vanguard 401(k) with a single index fund. Portfolio and net worth history charts now show realistic variation across all time filters (1W through ALL) using regime-based drift and multi-frequency sine waves.

## Ask Abacus demo chat

The AI assistant works fully client-side in demo mode with canned responses for all suggested prompts and page-level Ask Abacus buttons. Responses include data tables, spending breakdowns, portfolio analysis, savings rate trends, and coffee spending tracking — all computed from the live demo data. Simulates tool call activity with streaming delays for a realistic feel.

## Simplified landing page

The logged-out landing page now shows only a centered "Try Demo" button.

---

# UI overhaul, dedicated pages, and timezone fix — Shipped: April 12, 2026

## Dedicated Recurring Payments page

Recurring Payments now has its own page accessible from the sidebar (between Spending and Cash Flow). The recurring calendar has been moved out of the Spending page into this dedicated page with its own header and Ask Abacus button.

## Transactions page: grouped by day

Each day's transactions now renders as its own bordered card with a dark header showing the date, making it easier to scan through transaction history.

## Centralized Connect Account flow

All "Connect Account" buttons across the app now use a single centralized account type chooser modal (Bank/Credit Card vs Investment Account). Previously, several pages had their own duplicate modals or bypassed the chooser entirely.

## Empty states for Cash Flow and Upcoming Payments

The Cash Flow chart and Upcoming Payments modules now show helpful empty states with a Connect Account button when no relevant accounts are linked. The empty state detection has been improved to handle cases where you have investment accounts but no bank/credit accounts.

## Sidebar improvements

- Hamburger menu icon replaces the old panel toggle, swapped to the left with the Abacus logo on the right
- Section dividers are now dark horizontal lines for better visual separation
- Privacy & Security entry removed
- Recurring Payments entry added

## Ask Abacus buttons on all page headers

Cash Flow, Spending, Recurring Payments, and Transactions pages now have an "Ask Abacus" button in the page header that opens the AI assistant with a context-aware prompt. All "Ask AI" labels across the app have been renamed to "Ask Abacus".

## Spending page header consolidation

The Spending page no longer has two redundant headers. The period selector and total spend are now in the full-width page header alongside the Ask Abacus button.

## Get Started page condensed

The Get Started page layout has been tightened to fit within the initial viewport without removing any content.

## Darker borders on info cards

Ask Abacus info cards, conversation starters, and Get Started page cards now use darker borders consistent with other modules across the app.

## Floating chat bubble removed

The floating bottom-right AI chat bubble has been removed from all pages. The AI assistant is now accessible exclusively through the Ask Abacus buttons in page and module headers.

## Timezone fix: no more phantom future-date data points

All server-side date computations now use Eastern Time (`America/New_York`) instead of UTC. Previously, `toISOString().slice(0, 10)` was used in ~30 places across the server, which after ~7-8 PM ET would produce the next day's date — causing phantom data points for dates that hadn't happened yet. Fixed in: routes, snapshot jobs, backfill jobs, recurring payments, MCP server, and all AI agent system prompts.

---

# Dashboard polish, accounts reconnect, and investment value accuracy — Shipped: April 10, 2026

## Dashboard: cleaner Net Worth and Investment Portfolio modules

The Net Worth module has been simplified — the info button and Organic/Account Changes breakdown have been removed. The styling now matches the Investment Portfolio module: "Total Net Worth" label with a `+$X (+Y%)` change format. The chart is now an area chart with a visible gradient fill.

The Investment Portfolio module no longer shows the Top Movers carousel on the dashboard (still available on the full Investments page). Both modules are now equal height and have been moved above the Spending and Transactions modules in the dashboard grid.

"Add Connection" has been renamed to "Add Account" across the app.

## Accounts page: connection type modal and reconnect UI

Clicking "Add Account" on the Accounts page now shows the same connection type modal as the dashboard (Credit Cards vs Investments). Previously it went straight to the Plaid flow with no choice.

Accounts with Plaid connection errors now show:
- A **warning banner** at the top listing affected institutions with Reconnect and Remove buttons
- **Red error styling** on individual account rows with an "Error" badge and inline Reconnect button
- A **Remove** option for stale items that can no longer be reconnected (e.g., already invalidated in Plaid)

Clicking an investment account on the Accounts page now opens the same detail panel shown on the Investments page (holdings breakdown, account info).

## Investment Portfolio: accurate real-time values

The Total Portfolio Value header and chart now show consistent values:
- **Market open**: live Plaid API value (real-time holdings), updated every 60 seconds. The chart's "today" data point also reflects this live value.
- **Market closed**: latest snapshot value (captured at ~4:30 PM ET market close).

Previously, the header value could differ from the chart depending on which time range was selected, due to different data sources (live API vs. snapshots) fighting each other.

## Net Worth: fixed inflated historical values

The net worth chart was showing inflated historical values because investment account balances were being carried forward as a flat constant across all dates. Investment values now use per-date snapshots from `portfolio_account_snapshots`, and investment-type rows are excluded from `account_balance_snapshots` to prevent double-counting.

## Known Limitations document

A new [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) documents data accuracy caveats, Plaid quirks, and architectural trade-offs — including why recurring payment dates can be off by a day (Plaid uses post date, not charge date).

---

# Spending page, recurring payments, Ask AI everywhere, and MCP upgrades — Shipped: April 6, 2026

## Spending page

A new dedicated Spending page is now accessible from the sidebar and from the dashboard's "Spending" header (click the chevron). It includes:

- **Spending Breakdown module** — bar chart with daily/weekly/monthly views, category donut chart, and an insights section showing daily average, period-over-period comparison, biggest transactions, and most frequent merchants.
- **Exclude Rent toggle** — built into the spending module, on by default. Filters out rent and utilities from the bar chart, category breakdown, insights, and drill-down panels so you can focus on discretionary spending.
- **Biggest Transactions panel** — click the chevron on "Biggest Transactions" to see all transactions for the period ranked by amount, with clickable rows that open transaction details.
- **Most Frequent merchants panel** — click the chevron on "Most Frequent" to see merchants ranked by visit count (merchants with fewer than 2 transactions are hidden).
- **Recurring Payments calendar** — shows upcoming recurring charges on a monthly calendar with highlighted payment days, bigger fonts for readability, and month navigation.

## Ask AI buttons everywhere

Every module now has an **Ask AI** button that opens the assistant with a context-aware pre-filled prompt:

- **Spending Breakdown** — summarize spending habits and identify outliers
- **Recurring Payments** — list subscriptions and flag unusually high charges
- **Cash Flow** (dashboard) — analyze inflows vs outflows and identify trends
- **Upcoming Payments**, **Cash Flow**, and **Spending** headers on the dashboard are now clickable with chevrons linking to their dedicated pages

## Dashboard polish

- Module headers use consistent dark styling with equal-height headers across Cash Flow and Upcoming Payments.
- Period toggles and total amount moved into the chart body on the dashboard spending module.
- "Thinking" animation added to the AI assistant — shows "Putting it all together..." with a pulsing indicator when the agent is processing.
- Module borders darkened to #9ca3af across all pages for visual consistency.

## New MCP tools and enhancements

- **get_quotes** — new tool for real-time stock quotes for any ticker symbols (price, change, 52-week range, P/E, EPS, earnings date).
- **get_spending_summary** — now supports `exclude_categories` (e.g. exclude rent) and `group_by_account` (break down spending per account with per-account category details).
- **get_cash_flow_breakdown** — now supports `exclude_categories` for analyzing discretionary cash flow.
- **compare_cash_flow** — now supports `exclude_categories` applied to both periods for fair comparison.

---

# Investments deep-dive, live pricing, connection health, and AI tools — Shipped: April 6, 2026

## Live portfolio value during market hours

When the US stock market is open, the Total Portfolio Value on both the dashboard and the Investments page now updates in real time using Yahoo Finance prices (refreshed every 60 seconds). When the market is closed, the value falls back to the most recent Plaid snapshot. The 1D intraday chart now also includes cash and money market holdings in its baseline so the chart value matches the header.

## Connection health: know when an account isn't syncing

If one of your brokerage connections has a problem (expired login, Plaid can't reach it), you'll now see:

- A **warning banner** at the top of the Investments page naming the affected institution and explaining that your portfolio total may be incomplete.
- A **Reconnect** button in both the warning banner and the Accounts list that opens Plaid's re-authentication flow directly — no need to navigate back to the dashboard.
- **Yellow dots on the performance chart** on dates where one or more accounts were unavailable, so you can see which data points are affected rather than wondering about unexpected dips.

Accounts that need reconnecting also appear in the Accounts sidebar on the Investments page with a red "Reconnect" label.

## Investments page: dynamic period change

The stats row at the top of the Investments page now shows three columns: **Total Portfolio Value**, a **period change** that updates to match the selected chart range (1W Change, 1M Change, 3M Change, etc.), and **YTD Return**. Previously the middle column was always "Day Change" regardless of which range was selected.

## Snapshot staleness and completeness

Portfolio snapshots now track when they were last updated and which accounts were unavailable at the time. If you visit the Investments page and your snapshot is more than 30 minutes old or was taken with missing accounts, a fresh snapshot is automatically taken. This means reconnecting a broken account and revisiting the page will immediately capture the corrected data.

## Stock detail panel and Ask AI buttons

Clicking any ticker card in the Top Movers section opens a slide-in detail panel showing the stock's current price, daily change, 52-week range, your holdings of that stock, and an **Ask AI** button that opens the AI assistant pre-filled with a question about that ticker.

Ask AI buttons now appear on the Investment Portfolio header, Top Movers, and Portfolio Movers sections — each pre-filled with a relevant question. The buttons use a new rainbow hexagon icon.

## Market research agent

The AI assistant now has a **Market Research** agent that can look up real-time stock quotes, company profiles, and recent news for any ticker using Finnhub. Ask questions like "What's happening with AAPL?" or "Give me a summary of my portfolio's top movers this week" and the assistant will pull live market data into its answer.

## New MCP tools for Claude connector

The Claude connector (MCP) now has additional investment tools:

- **get_portfolio_history** — historical portfolio value over any time range
- **get_ticker_history** — daily price history for specific tickers
- **get_quotes** — real-time stock quotes
- **get_ticker_transactions** — trade history for a specific ticker across all accounts

## Benchmark comparison: portfolio vs S&P 500

You can now ask the AI assistant to compare your portfolio performance against the S&P 500 (or any other index like QQQ or DIA). The assistant fetches your portfolio history and the benchmark's daily prices from Yahoo Finance, normalizes both to % return, and renders a side-by-side chart. Try: "How has my portfolio compared to the S&P 500?"

## CLI: `/sp500` shortcut command

The Abacus CLI has a new `/sp500` command that instantly asks the AI to compare your portfolio against the S&P 500 with a chart — no need to type the full question. It appears in the slash command menu alongside `/help`, `/connect`, and `/accounts`.

---

# New domain — Shipped: April 2, 2026

Abacus is now served from **getabacus.xyz**. The CLI default server URL has been updated accordingly. Existing users with a saved config will continue to work — the new default only applies to fresh logins.

---

# Cash Flow page, AI cash flow tools, and trend indicators — Shipped: April 2, 2026

## Dedicated Cash Flow page

A new Cash Flow page is available from the sidebar. It gives you two views of your money:

- **Cash Flow Breakdown** — a Sankey diagram showing how money flows from income sources on the left to expense categories on the right. If you're saving money, a green "Savings" node appears on the right. You can break down by Category or Merchant using the toggle, and click any node to see the individual transactions behind it.
- **Cash Flow Over Time** — a bar chart showing inflows, outflows, and net over time. The chart automatically picks the right granularity (daily for a week, weekly for a month, monthly for longer). Click any bar to see the transactions for that period, split into Inflows and Outflows columns with search and sort.

The page has period selectors (Last Week, Last Month, Last 3 Months, Year to Date, Last Year, or a custom date range), an account filter, and a summary card showing Total Income, Total Expenses, Net Income, and Savings Rate.

## Trend indicators on the summary card

Each number in the summary card now shows a small trend arrow with a percentage comparing the current period to the equivalent prior period. For example, if you're viewing "Last Month", the trend compares to the month before that. Green arrows mean things are improving (income up, expenses down), red arrows mean the opposite.

## AI assistant and Claude connector: new cash flow tools

The AI assistant and the Claude connector (MCP) now have significantly deeper cash flow capabilities. You can ask questions like:

- **"Show me my daily cash flow for last week"** — the assistant now supports day, week, and month granularity with custom date ranges, not just monthly buckets.
- **"What's in my Food & Drink spending?"** — the assistant can drill into any category from a cash flow breakdown to show you the individual transactions behind it.
- **"How does this month compare to last month?"** — a new comparison tool shows headline deltas (income, expenses, net, savings rate) and highlights the top categories that changed the most.
- **"What subscriptions am I paying for?"** — the assistant can now look up your recurring bills and subscriptions (previously only available through the Claude connector).
- **"Show me cash flow for just my Chase account"** — all cash flow tools now support filtering by specific accounts.

The assistant also better understands everyday language. Questions like "where is my money going?", "am I saving enough?", "what's eating my paycheck?", or "can I afford this?" now route to the right data without needing financial jargon.

---

# Editable categories, recurring transactions, and subscription tracking — Shipped: April 1, 2026

## Change your transaction categories

You can now change the category and detailed category of any transaction. Click on a transaction to open its details, then use the dropdown menus to pick a new category. Your changes are saved automatically and will stick — even when you come back later.

## Mark transactions as recurring

A new "Recurring" dropdown lets you mark how often a transaction happens: weekly, bi-weekly, semi-monthly, monthly, quarterly, yearly, or annually. This is useful for tracking subscriptions and regular bills.

## Subscriptions show up in Upcoming Payments

When you categorize a transaction as a "Subscription" and set how often it recurs, it will automatically appear in your Upcoming Payments on the home page. The app predicts when your next payment is due based on the last transaction date and the frequency you selected.

## Better category filters on the Transactions page

The category filter on the Transactions page now shows all available categories — not just the ones you already have. There's also a new "Detailed Category" filter so you can drill down further (for example, filter by "Groceries" within "Food and Drink").

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
