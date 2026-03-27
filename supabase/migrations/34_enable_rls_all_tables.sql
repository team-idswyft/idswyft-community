-- ─────────────────────────────────────────────────────────────────────────────
-- M12: Enable Row-Level Security on all tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Defense-in-depth: if the Supabase anon key ever leaks, RLS ensures the
-- anon/authenticated roles cannot read or write any data.
--
-- Safety:
--   • Table owners bypass RLS by default (community edition: idswyft user)
--   • service_role has BYPASSRLS privilege (cloud edition: Supabase backend)
--   • ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent
--   • No FORCE ROW LEVEL SECURITY — owners remain exempt
--
-- With RLS enabled and zero permissive policies for anon/authenticated,
-- those roles get zero access. The backend (service_role / table owner)
-- is completely unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- Core tables (01_initial_schema.sql)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE selfies ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- Rate limits (07)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Idempotency (09)
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Provider metrics (11)
ALTER TABLE provider_metrics ENABLE ROW LEVEL SECURITY;

-- Mobile handoff (12)
ALTER TABLE mobile_handoff_sessions ENABLE ROW LEVEL SECURITY;

-- Verification contexts (13)
ALTER TABLE verification_contexts ENABLE ROW LEVEL SECURITY;

-- AML screening (17)
ALTER TABLE aml_screenings ENABLE ROW LEVEL SECURITY;

-- Risk scores (18)
ALTER TABLE verification_risk_scores ENABLE ROW LEVEL SECURITY;

-- Batch verification (19)
ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_items ENABLE ROW LEVEL SECURITY;

-- Monitoring (21)
ALTER TABLE reverification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE expiry_alerts ENABLE ROW LEVEL SECURITY;

-- Developer OTP (25)
ALTER TABLE developer_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_otp_rate_limits ENABLE ROW LEVEL SECURITY;

-- Webhook deliveries (20260319)
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- API activity logs (28)
ALTER TABLE api_activity_logs ENABLE ROW LEVEL SECURITY;

-- Verification reviewers (33)
ALTER TABLE verification_reviewers ENABLE ROW LEVEL SECURITY;

-- Admin users (created in initial schema but may use different name)
-- Guard with DO block in case admin_users doesn't exist in all deployments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- _migrations tracking table should NOT have RLS — the migration runner
-- needs unconditional access and it contains no sensitive data.
