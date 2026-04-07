-- Identity Vault: tokenized identity store with per-record AES-256-GCM encryption

CREATE TABLE IF NOT EXISTS identity_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  vault_token TEXT NOT NULL UNIQUE,
  verification_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  encrypted_data TEXT NOT NULL,
  encryption_key_id TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_token ON identity_vault(vault_token);
CREATE INDEX IF NOT EXISTS idx_vault_developer ON identity_vault(developer_id);
CREATE INDEX IF NOT EXISTS idx_vault_verification ON identity_vault(verification_id);
CREATE INDEX IF NOT EXISTS idx_vault_expires ON identity_vault(expires_at) WHERE status = 'active';

-- Share links: time-limited, scope-limited access for third parties
CREATE TABLE IF NOT EXISTS vault_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES identity_vault(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  allowed_attributes TEXT[] NOT NULL,
  recipient_label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  max_accesses INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_token ON vault_share_links(share_token);

-- Developer feature flags
ALTER TABLE developers ADD COLUMN IF NOT EXISTS vault_enabled BOOLEAN DEFAULT false;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS vault_auto_store BOOLEAN DEFAULT false;
