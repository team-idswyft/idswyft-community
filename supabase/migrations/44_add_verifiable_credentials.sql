-- Verifiable Credentials (W3C JWT-VC) support
-- Tracks issued credentials for revocation checks and audit

CREATE TABLE IF NOT EXISTS verifiable_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  credential_jti TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vc_verification ON verifiable_credentials(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_vc_jti ON verifiable_credentials(credential_jti);

ALTER TABLE developers ADD COLUMN IF NOT EXISTS vc_enabled BOOLEAN DEFAULT false;
