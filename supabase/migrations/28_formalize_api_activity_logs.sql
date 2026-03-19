-- Formalize the api_activity_logs table (auto-created by Supabase on first insert
-- from apiLogger.ts) with a proper schema, FK constraints, and a composite index
-- for the developer analytics endpoint.

CREATE TABLE IF NOT EXISTS api_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  method VARCHAR(10) NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT,
  ip_address TEXT,
  error_message TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_activity_developer_ts
  ON api_activity_logs (developer_id, timestamp DESC);
