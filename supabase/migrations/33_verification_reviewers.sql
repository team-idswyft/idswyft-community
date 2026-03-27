-- Verification reviewers: lightweight, passwordless reviewer accounts
-- scoped to a specific developer. Auth is via OTP (same as developer login).
-- NOTE: email is globally unique — a reviewer can only belong to one developer.

CREATE TABLE IF NOT EXISTS verification_reviewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verification_reviewers_email ON verification_reviewers(email);
CREATE INDEX IF NOT EXISTS idx_verification_reviewers_developer ON verification_reviewers(developer_id);
