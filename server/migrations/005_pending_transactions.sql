-- Store Plaid pending flag so we can show pending vs posted in the UI.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pending BOOLEAN DEFAULT false;
