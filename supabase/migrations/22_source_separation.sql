-- Migration: Source-separated storage
-- Adds source tagging to verification_requests and allows nullable file_path
-- for ephemeral (demo) verifications where files are deleted after processing.

-- Source tag: 'api' (SDK developers), 'vaas' (VaaS customer portal), 'demo' (demo page)
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'api';

-- Allow nullable file_path for ephemeral verifications (demo files deleted after extraction)
ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE selfies ALTER COLUMN file_path DROP NOT NULL;

-- Index for efficient demo cleanup queries
CREATE INDEX IF NOT EXISTS idx_verification_requests_source_created
  ON verification_requests (source, created_at)
  WHERE source = 'demo';
