-- Migration: Add developer OTP codes and GitHub OAuth support
-- Passwordless authentication for the developer portal

-- OTP codes table: stores hashed one-time codes for email verification
CREATE TABLE IF NOT EXISTS developer_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_developer_otp_codes_email_expires
  ON developer_otp_codes (email, expires_at);

-- Rate limiting for OTP sends (5 per hour per email)
CREATE TABLE IF NOT EXISTS developer_otp_rate_limits (
  email TEXT PRIMARY KEY,
  send_count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic rate limit check: upsert + return whether the send is allowed.
-- Resets the window when it has expired. Returns true if within limit.
CREATE OR REPLACE FUNCTION check_otp_rate_limit(p_email TEXT, p_max_sends INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO developer_otp_rate_limits (email, send_count, window_start, updated_at)
  VALUES (p_email, 1, NOW(), NOW())
  ON CONFLICT (email) DO UPDATE
    SET
      send_count = CASE
        WHEN developer_otp_rate_limits.window_start < NOW() - make_interval(secs => p_window_seconds)
        THEN 1
        ELSE developer_otp_rate_limits.send_count + 1
      END,
      window_start = CASE
        WHEN developer_otp_rate_limits.window_start < NOW() - make_interval(secs => p_window_seconds)
        THEN NOW()
        ELSE developer_otp_rate_limits.window_start
      END,
      updated_at = NOW()
  RETURNING send_count INTO v_count;

  RETURN v_count <= p_max_sends;
END;
$$;

-- Add GitHub OAuth columns to developers table
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS github_id BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_developers_github_id
  ON developers (github_id) WHERE github_id IS NOT NULL;
