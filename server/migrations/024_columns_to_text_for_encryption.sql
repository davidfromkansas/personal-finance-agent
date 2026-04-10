-- Change numeric, jsonb, and boolean columns to TEXT so they can hold encrypted ciphertext.
-- This must run before the data encryption migration.

-- plaid_items
ALTER TABLE plaid_items ALTER COLUMN accounts_cache TYPE TEXT USING accounts_cache::TEXT;
ALTER TABLE plaid_items ALTER COLUMN products_granted TYPE TEXT USING products_granted::TEXT;

-- transactions
ALTER TABLE transactions ALTER COLUMN amount TYPE TEXT USING amount::TEXT;
ALTER TABLE transactions ALTER COLUMN pending TYPE TEXT USING pending::TEXT;
ALTER TABLE transactions ALTER COLUMN location TYPE TEXT USING location::TEXT;
ALTER TABLE transactions ALTER COLUMN counterparties TYPE TEXT USING counterparties::TEXT;
ALTER TABLE transactions ALTER COLUMN payment_meta TYPE TEXT USING payment_meta::TEXT;

-- portfolio_snapshots
ALTER TABLE portfolio_snapshots ALTER COLUMN total_value TYPE TEXT USING total_value::TEXT;
ALTER TABLE portfolio_snapshots ALTER COLUMN unavailable_items TYPE TEXT USING unavailable_items::TEXT;

-- portfolio_account_snapshots
ALTER TABLE portfolio_account_snapshots ALTER COLUMN value TYPE TEXT USING value::TEXT;

-- holdings_snapshots
ALTER TABLE holdings_snapshots ALTER COLUMN quantity TYPE TEXT USING quantity::TEXT;
ALTER TABLE holdings_snapshots ALTER COLUMN price TYPE TEXT USING price::TEXT;
ALTER TABLE holdings_snapshots ALTER COLUMN value TYPE TEXT USING value::TEXT;
ALTER TABLE holdings_snapshots ALTER COLUMN cost_basis TYPE TEXT USING cost_basis::TEXT;

-- investment_transactions
ALTER TABLE investment_transactions ALTER COLUMN quantity TYPE TEXT USING quantity::TEXT;
ALTER TABLE investment_transactions ALTER COLUMN price TYPE TEXT USING price::TEXT;
ALTER TABLE investment_transactions ALTER COLUMN amount TYPE TEXT USING amount::TEXT;
ALTER TABLE investment_transactions ALTER COLUMN fees TYPE TEXT USING fees::TEXT;

-- account_balance_snapshots
ALTER TABLE account_balance_snapshots ALTER COLUMN current TYPE TEXT USING current::TEXT;
ALTER TABLE account_balance_snapshots ALTER COLUMN available TYPE TEXT USING available::TEXT;
ALTER TABLE account_balance_snapshots ALTER COLUMN credit_limit TYPE TEXT USING credit_limit::TEXT;
