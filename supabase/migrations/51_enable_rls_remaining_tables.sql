-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS on remaining tables missed by migrations 34 and 49
-- ─────────────────────────────────────────────────────────────────────────────
-- Same defense-in-depth rationale: if the Supabase anon key leaks, RLS
-- ensures anon/authenticated roles get zero access. Table owners and
-- service_role are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- Duplicate detection (43)
ALTER TABLE dedup_fingerprints ENABLE ROW LEVEL SECURITY;

-- Phone OTP (37)
ALTER TABLE phone_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_otp_rate_limits ENABLE ROW LEVEL SECURITY;

-- Verifiable Credentials (44)
ALTER TABLE verifiable_credentials ENABLE ROW LEVEL SECURITY;

-- Organizations (if present — used by VaaS integration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_threshold_settings' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE organization_threshold_settings ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
