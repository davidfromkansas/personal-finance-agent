-- Creates plaid_items table for storing Plaid link data.
CREATE TABLE IF NOT EXISTS plaid_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);
