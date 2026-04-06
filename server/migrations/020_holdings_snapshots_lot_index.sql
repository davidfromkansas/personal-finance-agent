-- Add lot_index to support multiple lots of the same security in the same account.
-- Plaid can return separate holding rows for different vesting lots (e.g. ESPP, RSU tranches).
-- Without lot_index the upsert clobbers all but the last lot written.

ALTER TABLE holdings_snapshots ADD COLUMN IF NOT EXISTS lot_index SMALLINT NOT NULL DEFAULT 0;

-- Drop old constraint and create new one including lot_index
ALTER TABLE holdings_snapshots DROP CONSTRAINT IF EXISTS holdings_snapshots_user_id_date_account_id_security_id_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'holdings_snapshots_user_date_acct_sec_lot_key') THEN
    ALTER TABLE holdings_snapshots ADD CONSTRAINT holdings_snapshots_user_date_acct_sec_lot_key
      UNIQUE (user_id, date, account_id, security_id, lot_index);
  END IF;
END $$;
