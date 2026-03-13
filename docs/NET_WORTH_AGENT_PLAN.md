# Net Worth Agent — Data Plan

Parked here so we don't forget. These tables extend the investment portfolio data layer to give the financial agent a complete picture of the user's finances — not just investments, but all accounts, debts, and spending.

Build this after the investment portfolio milestones are complete.

---

## Additional Tables

### `net_worth_snapshots`

Daily total assets, debts, and net worth across all account types. Gives the agent a historical record of the user's full financial picture — not just investments.

```sql
CREATE TABLE net_worth_snapshots (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  date        DATE NOT NULL,
  assets      NUMERIC(18, 2),   -- depository + investment accounts
  debts       NUMERIC(18, 2),   -- credit + loan accounts
  net_worth   NUMERIC(18, 2),   -- assets - debts
  accounts    JSONB,            -- [{ account_id, name, type, institution, value }]
  source      TEXT NOT NULL,    -- 'live' | 'backfill'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX ON net_worth_snapshots (user_id, date DESC);
```

**Agent questions this unlocks:**
- "What is my net worth trend over the past year?"
- "How much total debt am I carrying?"
- "What percentage of my net worth is in investments vs cash?"
- "Is my net worth growing faster than my spending?"
- "When did my net worth cross $500k?"

---

### `account_balance_snapshots`

Daily balance per account across all account types — checking, savings, credit cards, loans, investment. Gives the agent account-level granularity beyond the aggregates in `net_worth_snapshots`.

```sql
CREATE TABLE account_balance_snapshots (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          DATE NOT NULL,
  account_id    TEXT NOT NULL,
  account_name  TEXT,
  institution   TEXT,
  type          TEXT,        -- depository, credit, investment, loan
  subtype       TEXT,        -- checking, savings, brokerage, credit card, etc.
  current       NUMERIC(18, 2),
  available     NUMERIC(18, 2),
  currency      TEXT DEFAULT 'USD',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date, account_id)
);

CREATE INDEX ON account_balance_snapshots (user_id, account_id, date DESC);
CREATE INDEX ON account_balance_snapshots (user_id, date DESC);
```

**Agent questions this unlocks:**
- "How has my checking account balance trended?"
- "Am I carrying a credit card balance month to month?"
- "How much liquid cash do I have available right now?"
- "Which account has grown the most this year?"
- "Am I paying down my loans?"

---

## Implementation Notes

- Both tables written in the same balance fetch pass as `portfolio_snapshots` and `holdings_snapshots` — same API call, additional writes
- All rows scoped by `user_id = req.uid` — same pattern as every other table in the app
- `net_worth_snapshots` replaces the current back-calculation approach in `GET /api/plaid/net-worth-history` over time, same as `portfolio_snapshots` replaces `/investment-history`
- `account_balance_snapshots` gives the agent per-account drill-down that `net_worth_snapshots.accounts` JSONB doesn't support efficiently for time-series queries

---

## Full Agent Data Model (all tables combined)

| Table | Granularity | Agent value |
|---|---|---|
| `portfolio_snapshots` | Daily total + per account | Investment performance |
| `holdings_snapshots` | Daily per security | Position history, concentration |
| `investment_transactions` | Per transaction | Cost basis, dividends, activity |
| `net_worth_snapshots` | Daily total | Full financial picture over time |
| `account_balance_snapshots` | Daily per account | Cash, debt, liquidity trends |
| `transactions` (existing) | Per transaction | Spending, income, cash flow |

All 1st party data. No external sources required for the agent to answer comprehensive financial questions.
