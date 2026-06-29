-- ─────────────────────────────────────────────────
-- Operator email binding for service keys (isk_*)
-- ─────────────────────────────────────────────────
-- Binds a human "operator" to a specific service key. The operator logs in via
-- email OTP (Phase 2) and receives an api_key_id-scoped dashboard/review session.
-- Nullable; only meaningful for service keys. Ships to both editions (inert in
-- community, where no rows have is_service = true).
-- ─────────────────────────────────────────────────

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS operator_email TEXT;

-- operator_email may only be set on service keys
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_operator_email_service_only;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_operator_email_service_only
  CHECK (operator_email IS NULL OR is_service = TRUE);

-- Login lookup index (Phase 2 resolves keys by operator_email)
CREATE INDEX IF NOT EXISTS api_keys_operator_email_idx
  ON api_keys (operator_email) WHERE operator_email IS NOT NULL;

COMMENT ON COLUMN api_keys.operator_email IS
  'Email of the human operator bound to this service key (isk_*). They log in via email OTP and receive an api_key_id-scoped session. NULL for developer keys and unbound service keys.';
