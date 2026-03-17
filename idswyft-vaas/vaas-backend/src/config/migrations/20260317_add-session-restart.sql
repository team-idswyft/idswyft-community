-- Add retry_count column to vaas_verification_sessions for session restart tracking
ALTER TABLE vaas_verification_sessions
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
