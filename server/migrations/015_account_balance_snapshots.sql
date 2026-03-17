-- Daily balance snapshot per account per user. Written whenever we fetch live
-- balances from Plaid (accountsBalanceGet). One row per account per day (upsert).
CREATE TABLE IF NOT EXISTS account_balance_snapshots (
  id                SERIAL PRIMARY KEY,
  user_id           TEXT        NOT NULL,
  item_id           TEXT        NOT NULL,
  account_id        TEXT        NOT NULL,
  account_name      TEXT        NOT NULL,
  institution_name  TEXT,
  date              DATE        NOT NULL,
  current           NUMERIC(18, 2),   -- current balance (positive = asset, negative = owed)
  available         NUMERIC(18, 2),   -- available balance (null for credit/loan)
  credit_limit      NUMERIC(18, 2),   -- credit limit (null for non-credit accounts)
  type              TEXT,             -- depository | credit | loan | investment | other
  subtype           TEXT,             -- checking | savings | credit card | etc.
  currency          TEXT DEFAULT 'USD',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, account_id, date)
);

CREATE INDEX IF NOT EXISTS account_balance_snapshots_user_date_idx
  ON account_balance_snapshots (user_id, date DESC);

CREATE INDEX IF NOT EXISTS account_balance_snapshots_account_date_idx
  ON account_balance_snapshots (account_id, date DESC);
