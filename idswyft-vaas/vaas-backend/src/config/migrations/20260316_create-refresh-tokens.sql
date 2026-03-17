-- Refresh token table for server-side session management
CREATE TABLE IF NOT EXISTS vaas_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES vaas_admins(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vaas_refresh_tokens_hash ON vaas_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_vaas_refresh_tokens_admin ON vaas_refresh_tokens(admin_id);
CREATE INDEX IF NOT EXISTS idx_vaas_refresh_tokens_expires ON vaas_refresh_tokens(expires_at);
