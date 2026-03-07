-- Mobile handoff sessions: desktop-to-phone QR code verification handoff
-- A desktop creates a session with token + api_key + user_id.
-- The phone scans the QR, fetches the session, and completes the verification.
-- The desktop polls for completion.

CREATE TABLE IF NOT EXISTS mobile_handoff_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       CHAR(64) NOT NULL UNIQUE,   -- 32 random bytes as hex
  api_key     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  result      JSONB,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mobile_handoff_sessions_token_idx ON mobile_handoff_sessions (token);
CREATE INDEX IF NOT EXISTS mobile_handoff_sessions_expires_at_idx ON mobile_handoff_sessions (expires_at);
