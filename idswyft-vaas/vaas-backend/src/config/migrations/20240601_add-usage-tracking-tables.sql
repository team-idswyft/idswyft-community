-- Usage tracking tables for VaaS metering
-- Provides real usage data for organization billing and API key analytics

-- Monthly aggregate usage records per organization (billing source of truth)
CREATE TABLE IF NOT EXISTS vaas_usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    verification_count INTEGER NOT NULL DEFAULT 0,
    api_calls INTEGER NOT NULL DEFAULT 0,
    storage_used_mb DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_vaas_usage_records_org_period
    ON vaas_usage_records(organization_id, period_start);

-- Daily per-API-key usage (analytics and rate limiting)
CREATE TABLE IF NOT EXISTS vaas_api_key_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL REFERENCES vaas_api_keys(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    request_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    rate_limit_hits INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(api_key_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_vaas_api_key_usage_key_date
    ON vaas_api_key_usage(api_key_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_vaas_api_key_usage_org_date
    ON vaas_api_key_usage(organization_id, usage_date);

-- Disable RLS (service role access only)
ALTER TABLE vaas_usage_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE vaas_api_key_usage DISABLE ROW LEVEL SECURITY;

-- Function to upsert daily API key usage (called from middleware)
CREATE OR REPLACE FUNCTION increment_api_key_usage(
    p_api_key_id UUID,
    p_organization_id UUID,
    p_is_success BOOLEAN DEFAULT TRUE
) RETURNS VOID AS $$
BEGIN
    INSERT INTO vaas_api_key_usage (api_key_id, organization_id, usage_date, request_count, success_count, error_count)
    VALUES (p_api_key_id, p_organization_id, CURRENT_DATE, 1,
            CASE WHEN p_is_success THEN 1 ELSE 0 END,
            CASE WHEN p_is_success THEN 0 ELSE 1 END)
    ON CONFLICT (api_key_id, usage_date)
    DO UPDATE SET
        request_count = vaas_api_key_usage.request_count + 1,
        success_count = vaas_api_key_usage.success_count + CASE WHEN p_is_success THEN 1 ELSE 0 END,
        error_count = vaas_api_key_usage.error_count + CASE WHEN p_is_success THEN 0 ELSE 1 END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
