-- Daily per-security detail per account. Fully denormalized — no joins needed for agent queries.
CREATE TABLE IF NOT EXISTS holdings_snapshots (
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

CREATE INDEX IF NOT EXISTS holdings_snapshots_user_date_idx ON holdings_snapshots (user_id, date DESC);
CREATE INDEX IF NOT EXISTS holdings_snapshots_user_ticker_date_idx ON holdings_snapshots (user_id, ticker, date DESC);
CREATE INDEX IF NOT EXISTS holdings_snapshots_user_account_date_idx ON holdings_snapshots (user_id, account_id, date DESC);
CREATE INDEX IF NOT EXISTS holdings_snapshots_user_type_date_idx ON holdings_snapshots (user_id, security_type, date DESC);
