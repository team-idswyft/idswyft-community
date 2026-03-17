-- Admin notifications table for VaaS admin bell icon / notification dropdown
CREATE TABLE IF NOT EXISTS vaas_admin_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  read            BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaas_admin_notifications_org_unread
  ON vaas_admin_notifications (organization_id, read, created_at DESC) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_vaas_admin_notifications_org_created
  ON vaas_admin_notifications (organization_id, created_at DESC);
