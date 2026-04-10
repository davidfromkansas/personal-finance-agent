-- Maps Firebase UIDs to opaque internal UUIDs.
-- firebase_uid_hash is an HMAC-SHA256 digest used for fast lookup.
-- firebase_uid_encrypted stores the actual UID encrypted (for recovery/debugging).
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid_hash      TEXT NOT NULL UNIQUE,
  firebase_uid_encrypted TEXT NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_firebase_uid_hash_idx ON users (firebase_uid_hash);
