-- Migration: Atomic OTP verification to prevent race conditions
-- Two concurrent verify requests for the same code can no longer both succeed.

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
  -- Atomically find and lock the latest valid OTP record for this email.
  -- FOR UPDATE SKIP LOCKED ensures only one concurrent request can claim it.
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

  -- Already exhausted?
  IF v_record.attempts >= p_max_attempts THEN
    UPDATE developer_otp_codes SET used_at = v_now WHERE id = v_record.id;
    RETURN jsonb_build_object('status', 'exhausted', 'attempts_left', 0);
  END IF;

  -- Increment attempts atomically
  UPDATE developer_otp_codes
  SET attempts = attempts + 1
  WHERE id = v_record.id;

  -- Check hash match
  IF v_record.code_hash = p_code_hash THEN
    -- Mark as used — successful verification
    UPDATE developer_otp_codes SET used_at = v_now WHERE id = v_record.id;
    RETURN jsonb_build_object('status', 'valid', 'attempts_left', p_max_attempts - v_record.attempts - 1);
  ELSE
    -- Wrong code
    DECLARE
      v_left INT := p_max_attempts - v_record.attempts - 1;
    BEGIN
      -- If no attempts left after this one, mark as used
      IF v_left <= 0 THEN
        UPDATE developer_otp_codes SET used_at = v_now WHERE id = v_record.id;
      END IF;
      RETURN jsonb_build_object('status', 'invalid', 'attempts_left', GREATEST(v_left, 0));
    END;
  END IF;
END;
$$;
