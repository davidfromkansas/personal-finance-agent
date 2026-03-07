# Investment Agent — Plan

## Goal

Calculate and store accurate historical investment portfolio values so the dashboard chart shows real performance (not a flat line), and so the future financial assistant agent has a trustworthy 1st party dataset to analyze.

---

## Core Formula

```
Portfolio Value(t) = Cash(t) + Σ [ Quantity_i(t) × AdjustedPrice_i(t) ]
```

- **Quantity_i(t)** — current holdings from Plaid `investmentsHoldingsGet`, adjusted backwards using `investmentsTransactionsGet` (buys/sells/vests/dividends)
- **AdjustedPrice_i(t)** — historical adjusted closing price from a market data API (adjusted for splits and dividends)
- **Cash(t)** — reconstructed by walking backwards through cash transactions (dividends received, contributions, withdrawals)

---

## Two-Phase Architecture

### Phase 1 — One-time backfill (runs on first connection)

Reconstruct historical portfolio values as far back as Plaid's transaction history allows.

1. Call `investmentsHoldingsGet` → get current quantities and tickers per account
2. Call `investmentsTransactionsGet` → get full transaction history Plaid has on file
3. For each security, walk backwards from today adjusting quantity per day:
   - Buy → subtract shares (owned fewer before the buy)
   - Sell → add shares back
   - RSU vest → subtract shares
   - Dividend reinvestment → subtract reinvested shares
4. Fetch historical adjusted closing prices for each ticker from a market data API
5. For each day: `value = Σ quantity_i(t) × price_i(t)` + cash
6. Store each day as a row in `portfolio_snapshots`

**Run once per user at connection time. Never re-run.**

### Phase 2 — Ongoing snapshots (runs forever after)

Every time Plaid balances are fetched (dashboard load, webhook, refresh), record the actual Plaid-reported portfolio value as a snapshot. This is ground truth — no reconstruction needed.

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Current holdings (qty + ticker) | Plaid `investmentsHoldingsGet` | Already in app |
| Historical transactions | Plaid `investmentsTransactionsGet` | New — needs to be called at backfill |
| Historical adjusted prices | Market data API (TBD) | Adjusted for splits + dividends |
| Ongoing portfolio value | Plaid `accountsBalanceGet` | Already fetched; just needs to be stored |

---

## Database Tables

### `portfolio_snapshots`

Daily total portfolio value. One row per user per day. Used by the chart and top-level agent performance queries.

```sql
CREATE TABLE portfolio_snapshots (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          DATE NOT NULL,
  total_value   NUMERIC(18, 2) NOT NULL,
  source        TEXT NOT NULL,   -- 'live' | 'backfill'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX ON portfolio_snapshots (user_id, date DESC);
```

### `portfolio_account_snapshots`

Daily value per account. Separate from `portfolio_snapshots` so per-account queries are flat SQL — no JSONB parsing. Easy to add new columns (e.g. `cash_balance`, `unrealized_gain`) without touching the parent table.

```sql
CREATE TABLE portfolio_account_snapshots (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          DATE NOT NULL,
  item_id       TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  account_name  TEXT,
  institution   TEXT,
  value         NUMERIC(18, 2),
  source        TEXT NOT NULL,   -- 'live' | 'backfill'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date, account_id)
);

CREATE INDEX ON portfolio_account_snapshots (user_id, date DESC);
CREATE INDEX ON portfolio_account_snapshots (user_id, account_id, date DESC);
```

### `holdings_snapshots`

Per-security detail per account per day. Fully denormalized — all fields stored on each row so agent queries need no joins. Used for position-level history, concentration analysis, unrealized gain tracking.

```sql
CREATE TABLE holdings_snapshots (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  date            DATE NOT NULL,
  item_id         TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  account_name    TEXT,
  institution     TEXT,
  security_id     TEXT,
  ticker          TEXT,
  security_name   TEXT,
  security_type   TEXT,          -- equity, etf, mutual fund, fixed income, cash, derivative
  quantity        NUMERIC(18, 6),
  price           NUMERIC(18, 4),
  value           NUMERIC(18, 2),
  cost_basis      NUMERIC(18, 2),
  currency        TEXT DEFAULT 'USD',
  source          TEXT NOT NULL,   -- 'live' | 'backfill'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date, account_id, security_id)
);

CREATE INDEX ON holdings_snapshots (user_id, date DESC);
CREATE INDEX ON holdings_snapshots (user_id, ticker, date DESC);
CREATE INDEX ON holdings_snapshots (user_id, account_id, date DESC);
CREATE INDEX ON holdings_snapshots (user_id, security_type, date DESC);
```

### `investment_transactions`

Every buy, sell, dividend, RSU vest, contribution, withdrawal from Plaid `investmentsTransactionsGet`. Synced ongoing (not just at backfill) so new activity is captured in real time.

```sql
CREATE TABLE investment_transactions (
  id                      SERIAL PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  item_id                 TEXT NOT NULL,
  account_id              TEXT NOT NULL,
  institution             TEXT,
  account_name            TEXT,
  plaid_investment_txn_id TEXT UNIQUE,
  date                    DATE NOT NULL,
  type                    TEXT,          -- buy, sell, dividend, transfer, vest, etc.
  subtype                 TEXT,
  security_id             TEXT,
  ticker                  TEXT,
  security_name           TEXT,
  security_type           TEXT,
  quantity                NUMERIC(18, 6),
  price                   NUMERIC(18, 4),
  amount                  NUMERIC(18, 2),
  fees                    NUMERIC(18, 2),
  currency                TEXT DEFAULT 'USD',
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON investment_transactions (user_id, date DESC);
CREATE INDEX ON investment_transactions (user_id, ticker, date DESC);
CREATE INDEX ON investment_transactions (user_id, type, date DESC);   -- fast dividend/vest queries
CREATE INDEX ON investment_transactions (user_id, account_id, date DESC);
```

### `securities` (metadata cache)

One row per unique security seen. Stores enrichable metadata separately from the snapshot/transaction tables. Add `sector`, `asset_class`, `industry` here when ready — no schema changes needed on the other tables.

```sql
CREATE TABLE securities (
  security_id   TEXT PRIMARY KEY,
  ticker        TEXT,
  name          TEXT,
  type          TEXT,          -- equity, etf, mutual fund, fixed income, cash
  sector        TEXT,          -- Technology, Healthcare, etc. (future enrichment)
  asset_class   TEXT,          -- domestic equity, international equity, bond, etc. (future)
  currency      TEXT DEFAULT 'USD',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON securities (ticker);
```

Written whenever a new security is seen in holdings or transactions. The agent can join to this for metadata — but all core snapshot/transaction tables remain queryable standalone without this join.

---

**`source` field on snapshot tables** distinguishes live (Plaid-reported, ground truth) from backfill (reconstructed, approximate). The agent treats these differently.

---

## Design Decisions (what saves pain later)

These decisions were made deliberately to keep the schema scalable and agent-friendly.

**1. No JSONB for per-account data**
Per-account values are stored as flat rows in `portfolio_account_snapshots`, not as a JSONB blob in `portfolio_snapshots`. Flat rows mean the agent can query "which account grew the most" with simple SQL — no JSON parsing, no application-side unnesting. New per-account fields (e.g. `cash_balance`, `unrealized_gain`) are just `ALTER TABLE ADD COLUMN`.

**2. Fully denormalized snapshot/transaction rows**
`holdings_snapshots` and `investment_transactions` store all fields (ticker, security_name, security_type, institution, account_name) directly on each row. No joins required for agent queries. A query like "show me all PLTR rows over the last year" is a single scan — no lookups needed.

**3. `securities` table for enrichment, not for querying**
Security metadata that needs to grow over time (sector, asset_class, industry) lives in a separate `securities` table. The snapshot/transaction tables stay query-independent. Adding sector data later is an `ALTER TABLE securities ADD COLUMN` + backfill — zero impact on the tables the agent reads most.

**4. `item_id` on every table**
Storing `item_id` (Plaid connection) on holdings, account snapshots, and investment transactions means filtering by institution ("show me only Schwab holdings") is a direct filter — no join back to `plaid_items` needed. Also means data stays queryable even after a connection is disconnected, since historical rows are preserved.

**5. `security_type` stored at write time**
Plaid provides security type (equity, etf, mutual fund, etc.) on every holding and transaction. Storing it denormalized at write time means the agent can answer "how much of my portfolio is in ETFs vs individual stocks" without any enrichment step.

**6. `investment_transactions` synced ongoing, not just at backfill**
New buys, sells, dividends, and RSU vests are captured in real time from M1 onwards. The backfill (M2) fills in the past. This means the agent always has a complete, up-to-date activity log — not just historical data that goes stale.

**7. `ON CONFLICT DO UPDATE` for live, `DO NOTHING` for backfill**
Live snapshot writes always overwrite the day's row with the freshest Plaid data. Backfill writes never overwrite live data. This means re-running a backfill is always safe and idempotent.

**8. Blank on missing data, never extrapolate**
The chart and agent only work with data that exists. No filling gaps, no flat-line fallbacks. This prevents the agent from drawing conclusions from fabricated data points.

---

## Handling Missing Data

- If Plaid transaction history runs out before the full requested range → **show blank for those dates**. No extrapolation, no flat line.
- Holdings without a ticker (Vanguard 401k fund share classes, PCRA Trust, etc.) → **exclude from reconstruction, hold at current value** if they have a balance, or skip entirely.
- If a price lookup fails for a ticker → **exclude that holding from that day's value** and note it rather than silently using zero or current price.
- Chart renders from earliest available date as left edge — not from a fixed "1 year ago" anchor that would show empty space.

---

## Accuracy Profile by Account

| Account type | Reconstruction accuracy | Reason |
|---|---|---|
| Schwab individual (PLTR, etc.) | High | Public ticker, good Plaid history |
| Vanguard Rollover IRA | Medium–High | Mutual fund NAVs available |
| E*TRADE Stock Plan (EBAY RSUs) | Medium | RSU vest timing may be incomplete in Plaid |
| Vanguard 401k | Low | Fund-specific share classes, contribution complexity |
| PCRA Trust | Low / excluded | Likely no public price history |

Expected accuracy: ~85–90% of total portfolio value reconstructed reliably.

---

## Clean Data Boundary (Important for Agent)

```
Before first connection          After first connection
─────────────────────────────    ──────────────────────────────
source = 'backfill'              source = 'live'
Reconstructed / approximate      Plaid-reported / ground truth
1st party qty + 3rd party price  Actual broker-reported balance
One-time only                    Grows daily forever
```

The agent must treat these two sources differently:
- `live` snapshots → hard facts, agent can draw firm conclusions
- `backfill` snapshots → approximate context, agent should hedge claims ("approximately", "based on reconstructed data")

---

## API Changes

### New endpoint: `GET /api/plaid/portfolio-history?range=1W|1M|3M|YTD|1Y|ALL`

Reads from `portfolio_snapshots` table. Returns only dates where data exists — no fill, no interpolation.

Response:
```json
{
  "range": "1M",
  "history": [
    { "date": "2026-02-06", "value": 504210.00, "source": "backfill" },
    { "date": "2026-02-07", "value": 507883.00, "source": "backfill" },
    ...
    { "date": "2026-03-05", "value": 518937.00, "source": "live" }
  ]
}
```

### New endpoint: `POST /api/plaid/backfill-investment-history`

Triggers the one-time backfill for a user. Called automatically on first connection (after `exchange-token`). Idempotent — safe to call again, uses `ON CONFLICT DO NOTHING` so existing snapshots are never overwritten.

### Updated: snapshot write on every balance fetch

In `server/routes/plaid.js`, wherever `accountsBalanceGet` is called for investment accounts, write today's aggregate portfolio value to `portfolio_snapshots` with `source = 'live'`. Uses `ON CONFLICT (user_id, date) DO UPDATE` only if source is upgrading from `backfill` to `live`.

---

## Market Data API

**Selected: `yahoo-finance2` npm package**

> **Replaceability callout:** `yahoo-finance2` is an unofficial package with no API key required — ideal for getting started fast. All price lookups are isolated in `server/jobs/backfillInvestments.js` in a single `fetchHistoricalPrices(ticker, startDate, endDate)` function. If Yahoo Finance changes their API or a more reliable source is needed (Polygon.io, Alpha Vantage), swap only that function — zero changes to the rest of the backfill logic.

Requirements met:
- Adjusted closing prices (splits and dividends handled automatically)
- Coverage: US equities, ETFs, major mutual fund tickers
- History: 5+ years
- No API key, no rate limits for single-user use

---

## Milestones

---

### Milestone 1 — Capture real-time portfolio value ✦ start here

**Goal:** Stop the flat line. Start recording real Plaid-reported portfolio values daily so the chart has ground truth data growing from today forward. Also lay the complete data foundation so the agent has everything it needs from day one.

**What gets built:**

Migrations:
- [ ] `portfolio_snapshots` — daily total value
- [ ] `portfolio_account_snapshots` — daily per-account value (flat rows, not JSONB)
- [ ] `holdings_snapshots` — daily per-security detail per account
- [ ] `investment_transactions` — all investment activity (ongoing, not just backfill)
- [ ] `securities` — metadata cache, upserted whenever a new security is seen

On every balance fetch (`accountsBalanceGet` + `investmentsHoldingsGet`):
- [ ] Write `portfolio_snapshots` row (total value, `source = 'live'`) — `ON CONFLICT DO UPDATE`
- [ ] Write `portfolio_account_snapshots` rows (one per investment account) — `ON CONFLICT DO UPDATE`
- [ ] Write `holdings_snapshots` rows (one per security per account) — `ON CONFLICT DO UPDATE`
- [ ] Upsert `securities` rows for any new securities seen

On every transaction sync (`investmentsTransactionsGet`):
- [ ] Write new `investment_transactions` rows — `ON CONFLICT (plaid_investment_txn_id) DO NOTHING`
- [ ] Run alongside existing `transactionsSync` so new buys/sells/dividends/vests are captured in real time

New endpoint:
- [ ] `GET /api/plaid/portfolio-history?range=...` — reads from `portfolio_snapshots`, returns only dates that exist (no fill, no interpolation)

Frontend:
- [ ] `InvestmentPortfolio.jsx` calls new endpoint instead of `/investment-history`; chart renders from earliest available date as left edge; blank where no data exists

**Result:** Chart is no longer flat. All five tables are populated from day one. The agent has a complete, growing, ground-truth dataset immediately.

**Does not include:** Historical backfill. The chart will only show data from the day this ships forward.

---

### Milestone 2 — Historical backfill via investment transactions + market prices

**Goal:** Give the chart meaningful history from before the user started using the app, using 1st party transaction data combined with 3rd party historical prices.

**What gets built:**
- [ ] Select and integrate a market data API (options: `yahoo-finance2` npm package — no API key; Polygon.io free tier; Alpha Vantage free tier). Must support adjusted closing prices.
- [ ] Call `investmentsTransactionsGet` at backfill time — pull full transaction history Plaid has on file per investment account
- [ ] Quantity reconstruction logic: walk backwards from current holdings, adjusting per security per day for buys, sells, RSU vests, dividend reinvestments
- [ ] For each historical day: `value = Σ quantity_i(t) × adjustedPrice_i(t)` + cash
- [ ] Write each day to `portfolio_snapshots` with `source = 'backfill'` — `ON CONFLICT DO NOTHING` so live snapshots are never overwritten
- [ ] New endpoint `POST /api/plaid/backfill-investment-history` — triggers backfill for the authenticated user; idempotent
- [ ] Trigger backfill automatically on `exchange-token` success (first connection)

**Missing data rules:**
- If Plaid transaction history runs out → stop there, show blank before that date
- Holdings without a ticker (Vanguard 401k share classes, PCRA Trust) → exclude from reconstruction
- If price lookup fails for a ticker → exclude that holding from that day rather than using zero

**Result:** Chart shows real approximate history going back as far as Plaid's transaction data allows, merged seamlessly with live snapshots from Milestone 1.

---

### Milestone 3 — Agent data foundation

**Goal:** Ensure the financial assistant agent has a clean, queryable, fully 1st party dataset to work from.

**What gets built:**
- [ ] `source` field on `portfolio_snapshots` already distinguishes `live` (ground truth) from `backfill` (approximate) — agent context instructions must reflect this distinction
- [ ] Agent has read access to: `portfolio_snapshots`, `transactions`, holdings via `/api/plaid/investments`, spending via `/api/plaid/spending-summary`, cash flow via `/api/plaid/cash-flow`, net worth via `/api/plaid/net-worth-history`
- [ ] Define agent tool set: query portfolio history, query holdings, query transactions by date range, query spending by category, query net worth
- [ ] Agent system prompt establishes data fidelity rules: treat `live` snapshots as fact, treat `backfill` snapshots as approximate context, hedge language accordingly

**Result:** Agent can answer questions like "how has my portfolio performed this year?", "what are my biggest positions?", "am I spending more than I'm earning?", "what's my net worth trend?" — all from 1st party data.

---

## Agent Foundation

Once this is in place, the financial assistant agent has access to:

| Data | Table / Endpoint | Fidelity |
|---|---|---|
| Portfolio value history | `portfolio_snapshots` | High (live) / Medium (backfill) |
| Current holdings | Plaid `investmentsHoldingsGet` | Ground truth |
| Transaction history | `transactions` table | Ground truth |
| Spending patterns | `spending-summary` endpoint | Ground truth |
| Cash flow | `cash-flow` endpoint | Ground truth |
| Net worth history | `net-worth-history` endpoint | Ground truth |

All 1st party data. No external data sources required for the agent to be useful.

---

## Agent Use Cases

Questions the agent should be able to answer once M1 + M2 are complete. Used to validate the data model and guide agent tool design.

### Performance & returns
- "How has my portfolio performed YTD vs last year?"
- "What's my total return since I started investing?"
- "What's my best performing position of all time?"
- "What's my worst performing position?"
- "How much money have I made or lost on PLTR?"
- "What's my annualized return over the last 3 years?"

### Risk & concentration
- "How diversified am I?"
- "What percentage of my portfolio is in a single stock?"
- "How much of my net worth is tied up in one company?"
- "Am I over-concentrated in any one account or institution?"
- "Am I more concentrated in tech than I was 6 months ago?" ⚠️ needs sector enrichment

### Activity & decisions
- "What trades have I made in the last 90 days?"
- "Have I been a net buyer or net seller this year?"
- "What was my biggest single trade?"
- "How often do I buy vs sell?"
- "What would my portfolio be worth if I hadn't sold X?" ⚠️ needs M2 + historical prices

### Income
- "What's my total dividend income this year vs last year?"
- "Which positions pay me the most in dividends?"
- "How much have my RSU vests been worth in total?"
- "Am I on track to hit a certain income target from dividends?"

### Cost basis & taxes
- "What are my unrealized gains this year?"
- "What positions have unrealized losses I could harvest for tax purposes?"
- "What's my total cost basis across all accounts?"
- "Which lots have I held long enough to qualify for long-term capital gains?"

### Account-specific
- "How much is in my IRA vs taxable accounts?"
- "How much have I contributed to my IRA this year?"
- "Which of my accounts has performed the best?"
- "How has my Schwab account grown vs my Vanguard IRA?"

### Position-level
- "When did I first buy PLTR and what's my total return?"
- "How have my EBAY RSU vests performed since they vested?"
- "What's my average cost basis across all PLTR purchases?"
- "Which account holds the most PLTR?"

### Forward-looking / planning
- "At my current growth rate, when will my portfolio hit $1M?"
- "If PLTR drops 30%, how much does my total portfolio lose?"
- "What's my portfolio's sensitivity to a market downturn?"
- "How much would I need to save monthly to retire at 60?"

---

### Answerability with M1 + M2

| Category | Fully answerable | Needs extra work |
|---|---|---|
| Performance & returns | ✅ | Annualized return needs CAGR math (not a data gap) |
| Risk & concentration | ✅ mostly | Sector concentration needs sector enrichment |
| Activity & decisions | ✅ mostly | "What if I hadn't sold X" needs M2 + price history |
| Income | ✅ | — |
| Cost basis & taxes | ✅ | — |
| Account-specific | ✅ | — |
| Position-level | ✅ | — |
| Forward-looking | ⚠️ partial | Projections are estimates; benchmark comparisons need external data |
