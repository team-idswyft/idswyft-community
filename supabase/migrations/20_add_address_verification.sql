-- Address Verification
-- Adds columns to verification_requests for proof-of-address results.

ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS address_verification_status VARCHAR(20);
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS address_data JSONB;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS address_match_score DECIMAL(3,2);
