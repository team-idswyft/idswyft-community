-- Platform-level email branding configuration
-- Single-row table (id='default') for global email template settings
CREATE TABLE IF NOT EXISTS platform_email_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#22d3ee',
  footer_text TEXT DEFAULT 'Powered by Idswyft VaaS',
  company_name TEXT DEFAULT 'Idswyft',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_email_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
