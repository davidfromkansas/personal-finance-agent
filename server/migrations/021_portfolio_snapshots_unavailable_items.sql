-- Track which investment items failed to sync on each snapshot date
-- so the UI can annotate incomplete data points on the portfolio chart.
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS unavailable_items JSONB;
