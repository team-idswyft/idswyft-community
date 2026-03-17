-- GDPR consent tracking columns on vaas_end_users
-- Records when/how consent was given and whether the user has requested data deletion.

ALTER TABLE vaas_end_users
  ADD COLUMN IF NOT EXISTS consent_given_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_version     TEXT,
  ADD COLUMN IF NOT EXISTS consent_purpose     TEXT,
  ADD COLUMN IF NOT EXISTS data_deletion_requested_at TIMESTAMPTZ;

-- Index to quickly find outstanding deletion requests
CREATE INDEX IF NOT EXISTS idx_vaas_end_users_deletion_requested
  ON vaas_end_users (data_deletion_requested_at)
  WHERE data_deletion_requested_at IS NOT NULL;
