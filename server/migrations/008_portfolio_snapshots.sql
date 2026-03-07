-- Daily total portfolio value per user. Ground truth from Plaid (source='live') or reconstructed (source='backfill').
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          DATE NOT NULL,
  total_value   NUMERIC(18, 2) NOT NULL,
  source        TEXT NOT NULL,   -- 'live' | 'backfill'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_date_idx ON portfolio_snapshots (user_id, date DESC);
