-- Add institution_id (stable Plaid identifier, e.g. "ins_3" for Chase) and
-- products_granted (what Plaid actually authorised, from itemGet.billed_products)
-- to plaid_items. Both populated at token exchange time from a single itemGet call.
-- institution_id is used for duplicate-connection detection.
ALTER TABLE plaid_items
  ADD COLUMN IF NOT EXISTS institution_id TEXT,
  ADD COLUMN IF NOT EXISTS products_granted TEXT[];

CREATE INDEX IF NOT EXISTS idx_plaid_items_institution
  ON plaid_items (user_id, institution_id);
