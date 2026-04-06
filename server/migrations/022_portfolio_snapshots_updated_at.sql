-- Track when a snapshot was last updated so we can re-snapshot if stale.
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
