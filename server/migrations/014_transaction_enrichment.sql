ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS personal_finance_category_detailed TEXT,
  ADD COLUMN IF NOT EXISTS personal_finance_category_confidence TEXT,
  ADD COLUMN IF NOT EXISTS counterparties JSONB,
  ADD COLUMN IF NOT EXISTS payment_meta JSONB,
  ADD COLUMN IF NOT EXISTS check_number TEXT;
