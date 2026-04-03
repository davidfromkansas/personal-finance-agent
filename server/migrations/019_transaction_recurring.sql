-- Stores user-set or Plaid-inferred recurrence frequency for a transaction.
-- Values: WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, QUARTERLY, YEARLY, ANNUALLY
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring TEXT;
