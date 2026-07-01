-- ─────────────────────────────────────────────────
-- Per-key scoping for verifications
-- ─────────────────────────────────────────────────
-- Records the API key that initialized each verification so service-operator
-- dashboards (Phase 3b) and review (Phase 4) can scope verifications to a single
-- isk_* key. Nullable: existing rows and non-keyed sessions stay NULL (no
-- backfill). ON DELETE SET NULL so revoking a key never deletes its verification
-- history. The partial index excludes the all-NULL existing rows, so it builds
-- instantly regardless of table size. Ships to both editions (inert in community).
-- ─────────────────────────────────────────────────

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS verification_requests_api_key_id_idx
  ON verification_requests (api_key_id) WHERE api_key_id IS NOT NULL;

COMMENT ON COLUMN verification_requests.api_key_id IS
  'API key that initialized this verification. NULL for pre-existing rows and sessions not driven by a key. Scopes service-operator dashboards/review to a single key.';
