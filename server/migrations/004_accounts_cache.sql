-- Persists account metadata so connections display even when
-- Plaid API is rate-limited or server restarts with a cold cache.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS accounts_cache JSONB;
