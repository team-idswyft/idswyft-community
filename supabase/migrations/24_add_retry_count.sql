-- Add retry_count to verification_requests for retry flow support
ALTER TABLE verification_requests
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
