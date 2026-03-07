-- Investment activity: buys, sells, dividends, RSU vests, contributions, withdrawals. Append-only.
CREATE TABLE IF NOT EXISTS investment_transactions (
  id                      SERIAL PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  item_id                 TEXT NOT NULL,
  account_id              TEXT NOT NULL,
  institution             TEXT,
  account_name            TEXT,
  plaid_investment_txn_id TEXT UNIQUE,
  date                    DATE NOT NULL,
  type                    TEXT,          -- buy, sell, dividend, transfer, vest, etc.
  subtype                 TEXT,
  security_id             TEXT,
  ticker                  TEXT,
  security_name           TEXT,
  security_type           TEXT,
  quantity                NUMERIC(18, 6),
  price                   NUMERIC(18, 4),
  amount                  NUMERIC(18, 2),
  fees                    NUMERIC(18, 2),
  currency                TEXT DEFAULT 'USD',
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investment_transactions_user_date_idx ON investment_transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS investment_transactions_user_ticker_date_idx ON investment_transactions (user_id, ticker, date DESC);
CREATE INDEX IF NOT EXISTS investment_transactions_user_type_date_idx ON investment_transactions (user_id, type, date DESC);
CREATE INDEX IF NOT EXISTS investment_transactions_user_account_date_idx ON investment_transactions (user_id, account_id, date DESC);
