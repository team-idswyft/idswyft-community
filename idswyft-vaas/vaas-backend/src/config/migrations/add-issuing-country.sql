-- Migration: Add issuing_country (ISO alpha-2) to vaas_verification_sessions
-- Supports international ID verification by tracking document origin country.

ALTER TABLE vaas_verification_sessions ADD COLUMN IF NOT EXISTS issuing_country VARCHAR(2);
CREATE INDEX IF NOT EXISTS idx_vaas_sessions_issuing_country ON vaas_verification_sessions(issuing_country);
