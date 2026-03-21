-- Centralized platform configuration with audit trail
CREATE TABLE IF NOT EXISTS platform_config (
  key              TEXT PRIMARY KEY,
  value            TEXT,
  category         TEXT NOT NULL DEFAULT 'general',
  is_secret        BOOLEAN NOT NULL DEFAULT false,
  requires_restart BOOLEAN NOT NULL DEFAULT false,
  description      TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES platform_admins(id)
);

CREATE INDEX IF NOT EXISTS idx_pc_category ON platform_config (category);

CREATE TABLE IF NOT EXISTS platform_config_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  UUID REFERENCES platform_admins(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL CHECK (change_type IN ('create','update','delete','import'))
);

CREATE INDEX IF NOT EXISTS idx_pca_time ON platform_config_audit (changed_at DESC);
