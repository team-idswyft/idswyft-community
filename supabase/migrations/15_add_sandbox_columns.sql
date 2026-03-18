-- Add is_sandbox column to verification_requests and webhooks tables
-- These columns were referenced in code but missing from the schema

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT FALSE;

ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT FALSE;
