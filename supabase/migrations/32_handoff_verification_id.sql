-- Add verification_id to mobile_handoff_sessions for desktop fallback polling
ALTER TABLE mobile_handoff_sessions ADD COLUMN IF NOT EXISTS verification_id TEXT;
