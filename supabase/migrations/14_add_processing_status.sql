-- Add 'processing' to the verification_requests status check constraint.
-- This was missed when Phase 1 changed the OCR success update from 'verified'
-- to 'processing'. Without this the constraint fires on every OCR success, the
-- .catch() handler misclassifies the failure as EXTRACTION_FAILURE, and the
-- verification is routed to manual_review before live capture is ever shown.

ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_status_check;
ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_status_check
  CHECK (status IN ('pending', 'processing', 'verified', 'failed', 'manual_review'));
