-- Use authorized_date (when transaction was initially reported) for ordering and display.
-- Falls back to date (posted) when authorized_date is null.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS authorized_date DATE;
