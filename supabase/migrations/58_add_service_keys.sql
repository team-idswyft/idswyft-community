-- ─────────────────────────────────────────────────
-- Service keys (isk_*) — internal-product API keys
-- ─────────────────────────────────────────────────
-- Adds a new class of API key for internal Idswyft products
-- (starting with GatePass). Service keys bypass customer-facing
-- rate limits, quotas, and plan-tier gates. They reference
-- "shadow" developer rows so existing FKs (verification_requests,
-- webhooks, etc.) keep working unchanged. Audit trail differentiates
-- service-key calls via the new is_service flag.
--
-- Cloud-only feature: minting endpoints + auth middleware are
-- stripped from the community mirror, but these schema changes
-- ship to both editions (inert in community since no rows ever
-- have is_service=true there).
-- ─────────────────────────────────────────────────

-- 1. Add service-key columns to api_keys
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_product TEXT,
  ADD COLUMN IF NOT EXISTS service_environment TEXT,
  ADD COLUMN IF NOT EXISTS service_label TEXT;

-- 2. Invariant: service-key fields are all-or-nothing
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_service_fields_consistent;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_service_fields_consistent
  CHECK (
    (is_service = TRUE  AND service_product IS NOT NULL AND service_environment IS NOT NULL)
    OR
    (is_service = FALSE AND service_product IS NULL     AND service_environment IS NULL)
  );

-- 3. Constrain service_environment to known values
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_service_environment_valid;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_service_environment_valid
  CHECK (
    service_environment IS NULL
    OR service_environment IN ('production', 'staging', 'development')
  );

-- 4. Constrain service_product (start narrow; ALTER to add new products)
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_service_product_valid;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_service_product_valid
  CHECK (
    service_product IS NULL
    OR service_product IN ('gatepass', 'idswyft-internal')
  );

-- 5. Lookup index for service-key auth resolution
CREATE INDEX IF NOT EXISTS api_keys_service_lookup_idx
  ON api_keys (key_hash) WHERE is_service = TRUE AND is_active = TRUE;

-- 6. Audit log columns for filterability
ALTER TABLE api_activity_logs
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_product TEXT;

CREATE INDEX IF NOT EXISTS api_activity_logs_service_product_idx
  ON api_activity_logs (service_product, timestamp DESC) WHERE is_service = TRUE;

-- 7. Shadow developers
-- Service keys reference these synthetic developer rows via developer_id
-- (existing FK). This preserves all existing code paths that read
-- req.developer.id without conditional handling. The shadow rows are
-- filtered out of admin developer-list views via the email pattern
-- 'service+%@idswyft.app'.
INSERT INTO developers (id, email, name, company, status, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    'service+gatepass@idswyft.app',
    'GatePass Service Account',
    'Idswyft (internal)',
    'active',
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'service+internal@idswyft.app',
    'Idswyft Internal Service Account',
    'Idswyft (internal)',
    'active',
    NOW(),
    NOW()
  )
ON CONFLICT (email) DO NOTHING;

-- 8. RLS policies
-- Service keys are admin-minted only and managed via the service_role
-- (no authenticated developer can read them). The existing
-- developers_own_api_keys policy (from migration 57) restricts
-- authenticated reads to rows where developer_id = auth.uid(); since
-- shadow developers don't authenticate, no JWT can match — so service
-- keys are invisible to authenticated developer queries by default.
-- No new policy needed.

COMMENT ON COLUMN api_keys.is_service IS
  'TRUE for service keys (isk_*); FALSE for developer keys (ik_*)';
COMMENT ON COLUMN api_keys.service_product IS
  'Internal product the key is scoped to (gatepass, idswyft-internal). NULL for developer keys.';
COMMENT ON COLUMN api_keys.service_environment IS
  'Environment scope: production, staging, development. NULL for developer keys.';
COMMENT ON COLUMN api_keys.service_label IS
  'Human-readable label shown in admin UI (e.g. "GatePass production"). NULL for developer keys.';
COMMENT ON COLUMN api_activity_logs.is_service IS
  'Denormalized flag from api_keys.is_service for fast filtering';
COMMENT ON COLUMN api_activity_logs.service_product IS
  'Denormalized from api_keys.service_product for service-key call analytics';
