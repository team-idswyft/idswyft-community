-- ─────────────────────────────────────────────────
-- Add 'kazivio' as a first-class service product
-- ─────────────────────────────────────────────────
-- Migration 58 constrained api_keys.service_product to
-- ('gatepass', 'idswyft-internal') and noted "ALTER to add new products".
-- Kazivio is a new internal product that needs its own service keys and its
-- own telemetry bucket (api_activity_logs.service_product = 'kazivio'), so it
-- becomes a first-class product rather than riding under 'idswyft-internal'.
--
-- Cloud-only feature: the minting endpoints and auth middleware are stripped
-- from the community mirror, but this schema change ships to both editions
-- (inert in community, where no rows ever have is_service = true).
-- ─────────────────────────────────────────────────

-- 1. Widen the service_product CHECK constraint to include 'kazivio'
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_service_product_valid;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_service_product_valid
  CHECK (
    service_product IS NULL
    OR service_product IN ('gatepass', 'idswyft-internal', 'kazivio')
  );

-- 2. Shadow developer row for Kazivio service keys
-- Service keys reference a synthetic developer row via developer_id (existing
-- FK). The row cannot log in (no password, no JWT, no admin role) and is hidden
-- from admin developer-list views by the 'service+%@idswyft.app' email pattern.
INSERT INTO developers (id, email, name, company, status, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    'service+kazivio@idswyft.app',
    'Kazivio Service Account',
    'Idswyft (internal)',
    'active',
    NOW(),
    NOW()
  )
ON CONFLICT (email) DO NOTHING;

-- 3. Refresh the column comment to list the current product set
COMMENT ON COLUMN api_keys.service_product IS
  'Internal product the key is scoped to (gatepass, idswyft-internal, kazivio). NULL for developer keys.';
