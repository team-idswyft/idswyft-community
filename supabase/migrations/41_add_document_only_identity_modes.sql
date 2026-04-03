-- Migration 41: Add document_only and identity verification modes to CHECK constraint
-- These modes were added to the application code but missing from the DB constraint,
-- causing the verification_mode column to silently stay 'full' on INSERT/UPDATE.

ALTER TABLE verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_verification_mode_check;

ALTER TABLE verification_requests
  ADD CONSTRAINT verification_requests_verification_mode_check
  CHECK (verification_mode IN ('full', 'document_only', 'identity', 'liveness_only', 'document_refresh', 'age_only'));
