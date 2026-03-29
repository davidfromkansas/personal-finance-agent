-- Long-lived tokens for CLI and MCP clients. Tokens are stored hashed (SHA-256).
-- The plaintext token is only returned once at creation time.
CREATE TABLE IF NOT EXISTS cli_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  name          TEXT,                        -- e.g. "MacBook Pro", "Claude Desktop"
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS cli_tokens_user_idx ON cli_tokens (user_id);
