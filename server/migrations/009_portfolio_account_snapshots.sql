-- Daily value per investment account. Flat rows (not JSONB) so per-account queries are simple SQL.
CREATE TABLE IF NOT EXISTS portfolio_account_snapshots (
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

CREATE INDEX IF NOT EXISTS portfolio_account_snapshots_user_date_idx ON portfolio_account_snapshots (user_id, date DESC);
CREATE INDEX IF NOT EXISTS portfolio_account_snapshots_user_account_date_idx ON portfolio_account_snapshots (user_id, account_id, date DESC);
