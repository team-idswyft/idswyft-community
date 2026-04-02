-- Migration 38: Add age verification mode
-- Adds age_threshold column and extends verification_mode CHECK constraint
-- to support age_only verification mode (lightweight 18+/21+ checks)

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS age_threshold SMALLINT;

ALTER TABLE verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_verification_mode_check;

ALTER TABLE verification_requests
  ADD CONSTRAINT verification_requests_verification_mode_check
  CHECK (verification_mode IN ('full', 'liveness_only', 'document_refresh', 'age_only'));
