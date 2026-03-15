-- Migration: Add monitoring tables for ongoing re-verification and document expiry alerts
-- Feature 9: Ongoing Monitoring & Re-verification

-- Reverification schedules — developers can schedule periodic re-verification for their users
CREATE TABLE IF NOT EXISTS reverification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verification_request_id UUID REFERENCES verification_requests(id) ON DELETE SET NULL,
  interval_days INTEGER NOT NULL DEFAULT 365,
  next_verification_at TIMESTAMPTZ NOT NULL,
  last_verification_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_interval_days CHECK (interval_days >= 30 AND interval_days <= 730)
);

CREATE INDEX IF NOT EXISTS idx_reverification_next
  ON reverification_schedules(next_verification_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reverification_developer
  ON reverification_schedules(developer_id);

CREATE INDEX IF NOT EXISTS idx_reverification_user
  ON reverification_schedules(user_id);

-- Unique constraint: one active schedule per developer+user
CREATE UNIQUE INDEX IF NOT EXISTS idx_reverification_active_unique
  ON reverification_schedules(developer_id, user_id)
  WHERE status = 'active';

-- Expiry alerts — tracks document expiration warnings sent to developers
CREATE TABLE IF NOT EXISTS expiry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  expiry_date DATE NOT NULL,
  alert_type VARCHAR(20) NOT NULL, -- '90_day', '60_day', '30_day', 'expired'
  webhook_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_alert_type CHECK (alert_type IN ('90_day', '60_day', '30_day', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_developer
  ON expiry_alerts(developer_id);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_verification
  ON expiry_alerts(verification_request_id);

-- Prevent duplicate alerts for same verification + alert type
CREATE UNIQUE INDEX IF NOT EXISTS idx_expiry_alerts_unique
  ON expiry_alerts(verification_request_id, alert_type);
