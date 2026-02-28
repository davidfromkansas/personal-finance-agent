-- Add payment_channel and personal_finance_category to transactions
-- for filtering spending vs transfers in spending graphs.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_channel TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS personal_finance_category TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_pfc ON transactions(personal_finance_category);
