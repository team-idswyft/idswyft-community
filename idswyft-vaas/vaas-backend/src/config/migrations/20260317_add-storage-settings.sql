-- Add storage_settings JSONB column to vaas_organizations
-- Stores per-org document storage configuration (provider, region, credentials, retention)

ALTER TABLE vaas_organizations
  ADD COLUMN IF NOT EXISTS storage_settings JSONB DEFAULT '{}';

COMMENT ON COLUMN vaas_organizations.storage_settings IS 'Per-org document storage config: provider, data region, credentials, retention policy';
