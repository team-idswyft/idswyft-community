-- Replace plaintext api_key with a UUID foreign key to api_keys.
-- Existing sessions cannot be backfilled (raw key → api_key_id mapping is lossy),
-- so we delete all rows first. Sessions have a 30-min TTL, so any active sessions
-- will simply expire and the user rescans the QR code.
DELETE FROM mobile_handoff_sessions;

ALTER TABLE mobile_handoff_sessions
  ADD COLUMN IF NOT EXISTS api_key_id UUID NOT NULL REFERENCES api_keys(id);

ALTER TABLE mobile_handoff_sessions
  DROP COLUMN IF EXISTS api_key;

CREATE INDEX IF NOT EXISTS mobile_handoff_sessions_api_key_id_idx
  ON mobile_handoff_sessions (api_key_id);
