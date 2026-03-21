-- Key change request table for encryption key rotation/reset approval workflow
CREATE TABLE IF NOT EXISTS platform_key_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario        TEXT NOT NULL CHECK (scenario IN ('rotate', 'reset')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','executed','expired','cancelled')),
  reason          TEXT,
  requested_by    UUID NOT NULL REFERENCES platform_admins(id),
  approved_by     UUID REFERENCES platform_admins(id),
  approved_at     TIMESTAMPTZ,
  denied_by       UUID REFERENCES platform_admins(id),
  denied_at       TIMESTAMPTZ,
  executed_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  approval_token  TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique partial index: enforces at most one pending request at the DB level (prevents race conditions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kcr_one_pending ON platform_key_change_requests (status) WHERE status = 'pending';
