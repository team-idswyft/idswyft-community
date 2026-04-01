-- Phone OTP: developer-provided SMS credentials + phone OTP tables
-- Mirrors the LLM provider pattern (migration 27) for SMS.

-- ── Developer SMS config (BYOC — bring your own credentials) ────────────
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS sms_provider TEXT CHECK (sms_provider IN ('twilio', 'vonage')),
  ADD COLUMN IF NOT EXISTS sms_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS sms_api_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS sms_phone_number TEXT;

COMMENT ON COLUMN developers.sms_provider IS 'SMS provider for phone OTP: twilio, vonage, or custom';
COMMENT ON COLUMN developers.sms_api_key_encrypted IS 'AES-256-GCM encrypted API key / Account SID';
COMMENT ON COLUMN developers.sms_api_secret_encrypted IS 'AES-256-GCM encrypted auth token / API secret';
COMMENT ON COLUMN developers.sms_phone_number IS 'Sender phone number (E.164 format, e.g. +15551234567)';

-- ── Phone OTP codes (mirrors developer_otp_codes) ──────────────────────
CREATE TABLE IF NOT EXISTS phone_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_vr_expires
  ON phone_otp_codes (verification_request_id, expires_at);

-- ── Phone OTP rate limits (per verification session) ───────────────────
CREATE TABLE IF NOT EXISTS phone_otp_rate_limits (
  verification_request_id UUID PRIMARY KEY REFERENCES verification_requests(id) ON DELETE CASCADE,
  send_count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Atomic rate limit check (mirrors check_otp_rate_limit) ─────────────
CREATE OR REPLACE FUNCTION check_phone_otp_rate_limit(
  p_vr_id UUID,
  p_max_sends INT,
  p_window_seconds INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_row phone_otp_rate_limits%ROWTYPE;
BEGIN
  INSERT INTO phone_otp_rate_limits (verification_request_id, send_count, window_start, updated_at)
  VALUES (p_vr_id, 1, NOW(), NOW())
  ON CONFLICT (verification_request_id) DO UPDATE
    SET send_count = CASE
          WHEN phone_otp_rate_limits.window_start + (p_window_seconds || ' seconds')::INTERVAL < NOW()
          THEN 1
          ELSE phone_otp_rate_limits.send_count + 1
        END,
        window_start = CASE
          WHEN phone_otp_rate_limits.window_start + (p_window_seconds || ' seconds')::INTERVAL < NOW()
          THEN NOW()
          ELSE phone_otp_rate_limits.window_start
        END,
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row.send_count <= p_max_sends;
END;
$$ LANGUAGE plpgsql;

-- ── Atomic OTP verification (mirrors verify_otp_atomic) ────────────────
CREATE OR REPLACE FUNCTION verify_phone_otp_atomic(
  p_vr_id UUID,
  p_code_hash TEXT,
  p_max_attempts INT
) RETURNS JSONB AS $$
DECLARE
  v_record phone_otp_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_record
  FROM phone_otp_codes
  WHERE verification_request_id = p_vr_id
    AND used_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'attempts_left', 0);
  END IF;

  IF v_record.attempts >= p_max_attempts THEN
    RETURN jsonb_build_object('status', 'exhausted', 'attempts_left', 0);
  END IF;

  UPDATE phone_otp_codes SET attempts = attempts + 1 WHERE id = v_record.id;

  IF v_record.code_hash = p_code_hash THEN
    UPDATE phone_otp_codes SET used_at = NOW() WHERE id = v_record.id;
    RETURN jsonb_build_object('status', 'valid', 'attempts_left', p_max_attempts - v_record.attempts - 1);
  ELSE
    RETURN jsonb_build_object('status', 'invalid', 'attempts_left', p_max_attempts - v_record.attempts - 1);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── GDPR: add phone_otp tables to data retention scope ─────────────────
-- (handled in DataRetentionService — no SQL needed, just a reminder)
