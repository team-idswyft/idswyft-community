-- External notification channels (Slack, Discord, Email, Webhook) with routing rules
CREATE TABLE IF NOT EXISTS platform_notification_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('slack','discord','email','webhook')),
  config          JSONB NOT NULL DEFAULT '{}',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES platform_admins(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_notification_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES platform_notification_channels(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  min_severity TEXT NOT NULL DEFAULT 'info' CHECK (min_severity IN ('info','warning','error','critical')),
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_nr_event ON platform_notification_rules (event_type, enabled) WHERE enabled = true;
