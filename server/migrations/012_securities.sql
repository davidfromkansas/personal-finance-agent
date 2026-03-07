-- Security metadata cache. Upserted whenever a new security is seen in holdings or transactions.
-- sector and asset_class are intentionally null now — future enrichment, no schema change needed.
CREATE TABLE IF NOT EXISTS securities (
  security_id   TEXT PRIMARY KEY,
  ticker        TEXT,
  name          TEXT,
  type          TEXT,
  sector        TEXT,
  asset_class   TEXT,
  currency      TEXT DEFAULT 'USD',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS securities_ticker_idx ON securities (ticker);
