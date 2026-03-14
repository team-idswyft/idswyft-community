-- Expand vaas_verification_sessions.status CHECK constraint
-- to include 'verified' and 'manual_review' statuses that come
-- back from the main API verification pipeline.

ALTER TABLE vaas_verification_sessions DROP CONSTRAINT IF EXISTS vaas_verification_sessions_status_check;

ALTER TABLE vaas_verification_sessions ADD CONSTRAINT vaas_verification_sessions_status_check
  CHECK (status IN ('pending', 'document_uploaded', 'processing', 'completed', 'verified', 'failed', 'expired', 'terminated', 'manual_review'));
