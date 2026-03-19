# Investments — Implementation & Plan

## What it shows

Two surfaces: a dashboard widget (`InvestmentPortfolio`) and a dedicated Investments page (`InvestmentsPage`). Together they give the user a view of their current holdings, historical portfolio value, and per-security gain/loss.

---

## Current implementation

### Data sources

Two Plaid APIs, called per connected item:

1. **`investmentsHoldingsGet`** — current holdings: quantity, institution price, institution value, cost basis, security metadata (ticker, name, type). Called live on each request; also called by `snapshotInvestments` to write DB snapshots.

2. **`investmentsTransactionsGet`** — historical investment activity (buys, sells, dividends, reinvestments, fees). Synced with a 90-day lookback on each `portfolio-history` load; 730-day lookback on initial connection.

### DB tables

| Table | Purpose |
|---|---|
| `portfolio_snapshots` | User-level total portfolio value per day (`live` or `backfill`) |
| `portfolio_account_snapshots` | Per-account value per day |
| `holdings_snapshots` | Per-security per-account snapshot per day (quantity, price, value, cost_basis) |
| `investment_transactions` | Historical buys, sells, dividends, etc. |
| `securities` | Security metadata cache (ticker, name, type, currency) |

### Snapshot job — `server/jobs/snapshotInvestments.js`

Called from two places:
- **On `GET /api/plaid/portfolio-history`** — if no live snapshot exists for today, runs before returning data
- **On initial connection** — called with `daysBack: 730` after `exchange-token` to backfill 2 years of investment transaction history

Per item, it:
1. Calls `investmentsHoldingsGet` → writes `holdings_snapshots` + `portfolio_account_snapshots` rows for today
2. Aggregates per-item total → writes `portfolio_snapshots` for today
3. Calls `investmentsTransactionsGet` → upserts `investment_transactions`

Skips silently for: `PRODUCTS_NOT_SUPPORTED`, `NO_INVESTMENT_ACCOUNTS`, `CONSENT_NOT_GRANTED`, `ADDITIONAL_CONSENT_REQUIRED`, `ITEM_LOGIN_REQUIRED`.

### Routes

| Route | What it does |
|---|---|
| `GET /api/plaid/investments` | Calls `investmentsHoldingsGet` live for all items; returns flat holdings list with institution/account names, ticker, quantity, price, value, cost_basis |
| `GET /api/plaid/portfolio-history?range=1W\|1M\|3M\|YTD\|1Y\|ALL&account_ids=...` | Snapshots today if needed, then reads `portfolio_snapshots` or `portfolio_account_snapshots` for the requested range |

### Dashboard widget — `src/components/InvestmentPortfolio.jsx`

Sections (top to bottom):

**Header (purple)**
- Title: "Investment Portfolio" (+ selected account name if filtered)
- Total value in large text; unrealized gain/loss (amount + %) from cost basis
- Period change ("over period") from chart history start → end
- Range tabs: 1W · 1M · 3M · YTD · 1Y · ALL

**Disclaimer line**
- "Portfolio value based on current holdings. Historical values are approximate."

**Area chart**
- Purple line + gradient fill
- X-axis: date labels formatted by range (weekday, Mon D, or Mon 'YY)
- Y-axis: compact dollar amounts ($12k, $1.2M)
- Tooltip: full date + value
- Data is downsampled to max ~60–90 points to avoid chart overload

**Accounts list**
- One row per investment account (institution + account name + current value)
- Clicking an account filters the chart and holdings to that account only; click again to deselect

**Top Movers carousel**
- Up to 10 holdings with a known cost basis, sorted by absolute % gain/loss
- Horizontally scrollable cards showing: ticker badge, gain %, security name, current value, gain/loss amount
- Chevron scroll buttons; auto-detects whether left/right scroll is available

### Investments page — `src/pages/InvestmentsPage.jsx`

Simpler view: holdings grouped by institution, with per-holding rows showing:
- Security name + ticker badge
- Quantity · price per share · account name
- Current value
- Unrealized gain/loss (amount + %) — shown only when cost_basis is available

Total value shown in the card header.

### Gain/loss colors

- Gain (positive): blue (`#155dfc`)
- Loss (negative): red (`#dc2626`)

---

## What's included and excluded

| Type | Included | Reason |
|---|---|---|
| Equity holdings (stocks, ETFs) | ✅ | Core investment data |
| Mutual funds | ✅ | Returned by Plaid holdings API |
| Cash positions in brokerage accounts | ✅ | Plaid includes these as holdings |
| Retirement accounts (IRA, 401k) | ✅ if linked | Requires institution support |
| Accounts without investments product granted | ❌ | Silently skipped |
| Historical prices for backfill | ❌ | Plaid doesn't provide them; chart accumulates from day of connection |

---

## How historical chart data accumulates

Plaid does not provide a historical portfolio value API. We reconstruct history by:
1. Snapshotting today's holdings value each day the user loads the portfolio-history endpoint
2. On initial connection, backfilling 2 years of `investment_transactions` (but not historical prices — so we can't reconstruct past values accurately)

**Result:** the chart starts from the date the user first connected their investment account and fills in naturally over time. For a new user, the chart shows only today's value. After months of use, it shows a real history.

The disclaimer "Historical values are approximate" refers to the fact that these snapshots reflect the holdings value at time of snapshot, not intra-day prices.

---

## Known limitations

### 1. Chart is empty for new users

Until `snapshotInvestments` has been called on at least one prior day, there is only one data point (today). The chart shows "No investment history available" until a second snapshot exists.

**Accepted.** No fix without a 3rd-party price data source.

### 2. `portfolio_snapshots` not deleted on disconnect

`portfolio_snapshots` has no `item_id` column — it stores a user-level total. When an account is disconnected, its contribution to past snapshots is not removed. The chart may show inflated historical values after a disconnect.

**Accepted for now.** See `ACCOUNT_DISCONNECTION_FLOW.md` → Open questions.

### 3. Cost basis not always available

Plaid returns `cost_basis` only when the institution provides it. Many brokerages (especially for older lots, transferred positions, or certain account types) don't supply it. Gain/loss fields are hidden when cost_basis is null.

**Accepted.** No fix without user-entered cost basis.

### 4. Gain/loss is unrealized only

We show total gain/loss as `value - cost_basis`. This is unrealized gain only — it doesn't factor in dividends received, fees paid, or realized gains from past sales.

**Accepted.** Investment transactions are stored in `investment_transactions` — a realized P&L calculation is possible in the future.

### 5. Per-account chart uses `portfolio_account_snapshots`, not live Plaid data

When an account is selected in the dashboard widget, the chart reads `portfolio_account_snapshots` (our DB). If no snapshot exists for an account on a given day (e.g. new account, or a day the user didn't load the page), that day is missing from the chart rather than interpolated.

**Accepted.** Gaps fill in naturally over time.

### 6. No cron job — snapshots only accumulate on page load

Snapshots are written only when a user visits the portfolio-history endpoint. If a user doesn't open the app for a week, those days are missing from the chart.

**Potential fix:** Add a daily cron job to snapshot all users' portfolios (Railway cron or a scheduled function). `snapshotInvestments` is already designed to be callable from a cron.

---

## Potential improvements (not committed)

- **Daily cron snapshot** — fill gaps regardless of whether the user opens the app
- **Investment transaction history view** — show buys, sells, dividends from `investment_transactions`
- **Realized P&L** — compute gain/loss including closed positions and dividends
- **Per-holding chart** — click a holding to see its value history
- **Asset allocation breakdown** — pie or bar chart by security type (equity, fixed income, cash, etc.)
- **Sector / geography breakdown** — requires 3rd party security metadata
- **Benchmark comparison** — overlay S&P 500 on the portfolio chart
