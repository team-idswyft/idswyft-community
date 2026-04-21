-- Voice authentication: per-developer toggle and verification fields
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS voice_auth_enabled BOOLEAN DEFAULT false;

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS voice_challenge TEXT,
  ADD COLUMN IF NOT EXISTS voice_challenge_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voice_match_score REAL;

ALTER TABLE selfies
  ADD COLUMN IF NOT EXISTS enrollment_audio_path TEXT;

COMMENT ON COLUMN developers.voice_auth_enabled IS 'Per-developer toggle for voice authentication (default: disabled)';
COMMENT ON COLUMN verification_requests.voice_challenge IS 'Random digit challenge for voice anti-spoofing';
COMMENT ON COLUMN verification_requests.voice_challenge_created_at IS 'Timestamp when voice challenge was generated (expires after 120s)';
COMMENT ON COLUMN verification_requests.voice_match_score IS 'Cosine similarity score from speaker verification';
COMMENT ON COLUMN selfies.enrollment_audio_path IS 'Path to enrollment audio file for speaker verification';
