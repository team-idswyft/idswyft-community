-- Status Page Service: core tables

CREATE TABLE IF NOT EXISTS service_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'down')),
  latency_ms  INTEGER NOT NULL,
  details     TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_checks_service_time
  ON service_checks (service, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_checks_time
  ON service_checks (checked_at DESC);

-- Incidents

CREATE TABLE IF NOT EXISTS incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  severity          TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  affected_services TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  created_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_created
  ON incidents (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_created
  ON incidents (created_at DESC);

-- Incident updates (timeline)

CREATE TABLE IF NOT EXISTS incident_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  status      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_time
  ON incident_updates (incident_id, created_at ASC);

-- Daily status summary aggregate function

CREATE OR REPLACE FUNCTION get_daily_status_summary(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  day        DATE,
  service    TEXT,
  total      BIGINT,
  operational BIGINT,
  degraded   BIGINT,
  down_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(sc.checked_at) AS day,
    sc.service,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE sc.status = 'operational')::BIGINT AS operational,
    COUNT(*) FILTER (WHERE sc.status = 'degraded')::BIGINT AS degraded,
    COUNT(*) FILTER (WHERE sc.status = 'down')::BIGINT AS down_count
  FROM service_checks sc
  WHERE sc.checked_at >= (CURRENT_DATE - days_back)
  GROUP BY DATE(sc.checked_at), sc.service
  ORDER BY day DESC, sc.service;
END;
$$ LANGUAGE plpgsql STABLE;
