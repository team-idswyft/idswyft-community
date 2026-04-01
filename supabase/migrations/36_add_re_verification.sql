-- Re-verification: link returning user sessions to their parent verification
ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS parent_verification_id UUID REFERENCES verification_requests(id),
  ADD COLUMN IF NOT EXISTS verification_mode VARCHAR(20) DEFAULT 'full';
-- verification_mode: 'full' (default) or 'liveness_only' (re-verification)

CREATE INDEX IF NOT EXISTS idx_verification_requests_parent
  ON verification_requests(parent_verification_id)
  WHERE parent_verification_id IS NOT NULL;

COMMENT ON COLUMN verification_requests.parent_verification_id IS 'Links re-verification to original verified session';
COMMENT ON COLUMN verification_requests.verification_mode IS 'full = standard 5-step, liveness_only = re-verification (gates 4-6 only), document_refresh = re-verify with fresh front doc (face embedding expired)';
