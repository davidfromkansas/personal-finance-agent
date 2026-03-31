-- Persists Plaid item error state so the frontend can show reconnect prompts on load.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS error_code TEXT;
