-- Add session token columns to verification_requests
-- Session tokens replace raw API keys in browser URLs for hosted verification pages.
-- Tokens are HMAC-SHA256 hashed before storage (same pattern as API keys and handoff tokens).

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS session_token_hash CHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS session_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_api_key_id UUID REFERENCES api_keys(id);

CREATE INDEX IF NOT EXISTS idx_vr_session_token ON verification_requests(session_token_hash)
  WHERE session_token_hash IS NOT NULL;

-- Enforce: if session_token_hash is set, expiry must also be set
ALTER TABLE verification_requests
  ADD CONSTRAINT chk_session_token_expiry
  CHECK (session_token_hash IS NULL OR session_token_expires_at IS NOT NULL);
