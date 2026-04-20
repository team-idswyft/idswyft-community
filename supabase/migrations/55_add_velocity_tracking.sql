-- Migration: Add velocity tracking columns to verification_requests
-- Supports fraud velocity detection: IP velocity, user velocity, step timing anomalies

-- Add IP address captured at session initialization
ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- Add step completion timestamps for timing analysis
ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS step_timestamps JSONB DEFAULT '{}';

-- Index for IP-based velocity queries (only non-null IPs)
CREATE INDEX IF NOT EXISTS idx_vr_client_ip ON verification_requests (client_ip)
  WHERE client_ip IS NOT NULL;

-- Index for developer+time window queries
CREATE INDEX IF NOT EXISTS idx_vr_developer_created ON verification_requests (developer_id, created_at DESC);

-- Index for user+time window queries
CREATE INDEX IF NOT EXISTS idx_vr_user_created ON verification_requests (user_id, created_at DESC);
