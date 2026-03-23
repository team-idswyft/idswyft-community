-- Migration: Community Edition RPC Functions
-- Ensures all required stored procedures exist for community/self-hosted setups.
-- These functions may already exist from earlier migrations (25, 26) on Supabase-hosted
-- instances — CREATE OR REPLACE is idempotent.

-- ─── 1. OTP Rate Limit Check ────────────────────────────────
-- Used by: otpService.ts → checkRateLimit()
-- Atomic upsert + rate check for OTP sends (prevents race conditions)

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

-- ─── 2. Atomic OTP Verification ─────────────────────────────
-- Used by: otpService.ts → verifyOtp()
-- Prevents race conditions where two concurrent verify requests both succeed

CREATE OR REPLACE FUNCTION verify_otp_atomic(
  p_email TEXT,
  p_code_hash TEXT,
  p_max_attempts INT
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_record RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Atomically find and lock the latest valid OTP record
  SELECT * INTO v_record
  FROM developer_otp_codes
  WHERE email = p_email
    AND used_at IS NULL
    AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_record IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'attempts_left', 0);
  END IF;

  IF v_record.attempts >= p_max_attempts THEN
    UPDATE developer_otp_codes SET used_at = v_now WHERE id = v_record.id;
    RETURN jsonb_build_object('status', 'exhausted', 'attempts_left', 0);
  END IF;

  -- Increment attempts atomically
  UPDATE developer_otp_codes
  SET attempts = attempts + 1
  WHERE id = v_record.id;

  IF v_record.code_hash = p_code_hash THEN
    UPDATE developer_otp_codes SET used_at = v_now WHERE id = v_record.id;
    RETURN jsonb_build_object('status', 'valid', 'attempts_left', p_max_attempts - v_record.attempts - 1);
  ELSE
    DECLARE
      v_left INT := p_max_attempts - v_record.attempts - 1;
    BEGIN
      IF v_left <= 0 THEN
        UPDATE developer_otp_codes SET used_at = v_now WHERE id = v_record.id;
      END IF;
      RETURN jsonb_build_object('status', 'invalid', 'attempts_left', GREATEST(v_left, 0));
    END;
  END IF;
END;
$$;

-- ─── 3. Atomic Verification State Update ────────────────────
-- Used by: verificationConsistency.ts → updateVerificationState()
-- Locks the row, validates state transition, then updates atomically

CREATE OR REPLACE FUNCTION update_verification_with_state_check(
  p_verification_id UUID,
  p_expected_states TEXT[],
  p_new_status TEXT,
  p_update_data JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  current_status TEXT;
BEGIN
  SELECT status INTO current_status
  FROM verification_requests
  WHERE id = p_verification_id
  FOR UPDATE;

  IF current_status = ANY(p_expected_states) THEN
    UPDATE verification_requests
    SET
      status = p_new_status,
      face_match_score = COALESCE((p_update_data->>'face_match_score')::FLOAT, face_match_score),
      liveness_score = COALESCE((p_update_data->>'liveness_score')::FLOAT, liveness_score),
      cross_validation_score = COALESCE((p_update_data->>'cross_validation_score')::FLOAT, cross_validation_score),
      updated_at = NOW()
    WHERE id = p_verification_id;

    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;
