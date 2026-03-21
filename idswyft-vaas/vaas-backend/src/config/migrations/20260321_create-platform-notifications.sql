-- Platform notification system for real-time admin alerts
CREATE TABLE IF NOT EXISTS platform_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  source     TEXT,
  read       BOOLEAN NOT NULL DEFAULT false,
  read_by    UUID REFERENCES platform_admins(id),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pn_unread ON platform_notifications (read, created_at DESC) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_pn_created ON platform_notifications (created_at DESC);
