-- Add sync_cursor to plaid_items for incremental transaction sync.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS sync_cursor TEXT;

-- Transactions table: stores synced Plaid transactions per user.
CREATE TABLE IF NOT EXISTS transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  item_id              TEXT NOT NULL,
  account_id           TEXT NOT NULL,
  plaid_transaction_id TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  amount               NUMERIC(12,2) NOT NULL,
  date                 DATE NOT NULL,
  account_name         TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item_id);
