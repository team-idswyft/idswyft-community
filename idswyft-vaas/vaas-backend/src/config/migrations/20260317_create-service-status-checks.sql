-- Persistent health check storage for 30-day uptime tracking
CREATE TABLE IF NOT EXISTS service_status_checks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'down')),
  latency_ms   INTEGER NOT NULL DEFAULT 0,
  details      TEXT,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_checks_service_time
  ON service_status_checks (service, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_checks_time
  ON service_status_checks (checked_at DESC);

-- Aggregate function: returns daily status summary for the last N days
-- Called via vaasSupabase.rpc('get_daily_status_summary', { days_back: 30 })
CREATE OR REPLACE FUNCTION get_daily_status_summary(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  day         DATE,
  service     TEXT,
  total       BIGINT,
  operational BIGINT,
  degraded    BIGINT,
  down_count  BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (sc.checked_at AT TIME ZONE 'UTC')::DATE AS day,
    sc.service,
    COUNT(*)                                  AS total,
    COUNT(*) FILTER (WHERE sc.status = 'operational') AS operational,
    COUNT(*) FILTER (WHERE sc.status = 'degraded')    AS degraded,
    COUNT(*) FILTER (WHERE sc.status = 'down')         AS down_count
  FROM service_status_checks sc
  WHERE sc.checked_at >= (now() - (days_back || ' days')::INTERVAL)
  GROUP BY 1, 2
  ORDER BY 1;
END;
$$ LANGUAGE plpgsql STABLE;
