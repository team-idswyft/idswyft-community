-- SSO/SAML Configuration for Enterprise Organizations
-- Stores per-organization SAML 2.0 IdP configuration for SP-initiated SSO

CREATE TABLE IF NOT EXISTS organization_sso_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE REFERENCES vaas_organizations(id) ON DELETE CASCADE,
  idp_entity_id TEXT NOT NULL,
  idp_sso_url TEXT NOT NULL,
  idp_certificate TEXT NOT NULL,
  attribute_mapping JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by organization (UNIQUE constraint already creates an index,
-- but this makes the intent explicit for readers)
CREATE INDEX IF NOT EXISTS idx_sso_configs_org ON organization_sso_configs(organization_id);
