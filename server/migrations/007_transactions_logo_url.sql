-- Store merchant logo URL from Plaid /transactions/sync (added/modified) for use in recurring payments UI.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS logo_url TEXT;
