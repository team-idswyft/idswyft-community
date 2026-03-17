-- Baseline migration: idempotent CREATE TABLE IF NOT EXISTS for all VaaS core tables.
-- This allows bootstrapping a fresh database entirely via `npm run migrate`.
-- On existing databases the IF NOT EXISTS clauses make this a no-op.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    subscription_tier VARCHAR(20) NOT NULL DEFAULT 'starter',
    billing_status VARCHAR(20) NOT NULL DEFAULT 'active',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    settings JSONB DEFAULT '{}',
    branding JSONB DEFAULT '{}',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    support_email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Admin Users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    permissions JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- ── End Users ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_end_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    email VARCHAR(255),
    phone VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    external_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    verification_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Verification Sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_verification_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    end_user_id UUID NOT NULL REFERENCES vaas_end_users(id) ON DELETE CASCADE,
    idswyft_verification_id UUID NOT NULL,
    idswyft_user_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    results JSONB DEFAULT '{}',
    confidence_score DECIMAL(3,2),
    ip_address INET,
    user_agent TEXT,
    session_token VARCHAR(255),
    expires_at TIMESTAMPTZ,
    liveness_data JSONB DEFAULT '{}',
    submitted_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,
    issuing_country VARCHAR(2),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(idswyft_verification_id)
);

-- ── API Keys ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    key_name VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    scopes TEXT[] DEFAULT '{read,write}',
    rate_limit_per_hour INTEGER DEFAULT 1000,
    enabled BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(organization_id, name)
);

-- ── Webhooks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    events TEXT[] NOT NULL,
    secret_key VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Webhook Deliveries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES vaas_webhooks(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    http_status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- ── Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES vaas_admins(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Usage Records ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaas_usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES vaas_organizations(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    verification_count INTEGER NOT NULL DEFAULT 0,
    api_calls INTEGER NOT NULL DEFAULT 0,
    storage_used_mb INTEGER DEFAULT 0,
    base_amount_cents INTEGER NOT NULL DEFAULT 0,
    usage_amount_cents INTEGER NOT NULL DEFAULT 0,
    total_amount_cents INTEGER NOT NULL DEFAULT 0,
    billing_status VARCHAR(20) DEFAULT 'pending',
    stripe_invoice_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, period_start, period_end)
);

-- ── Indexes (IF NOT EXISTS supported on Postgres 9.5+) ──────────────────────
CREATE INDEX IF NOT EXISTS idx_vaas_organizations_slug ON vaas_organizations(slug);
CREATE INDEX IF NOT EXISTS idx_vaas_admins_org_id ON vaas_admins(organization_id);
CREATE INDEX IF NOT EXISTS idx_vaas_admins_email ON vaas_admins(email);
CREATE INDEX IF NOT EXISTS idx_vaas_end_users_org_id ON vaas_end_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_vaas_end_users_status ON vaas_end_users(verification_status);
CREATE INDEX IF NOT EXISTS idx_vaas_verification_sessions_org_id ON vaas_verification_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_vaas_verification_sessions_status ON vaas_verification_sessions(status);
CREATE INDEX IF NOT EXISTS idx_vaas_api_keys_org_id ON vaas_api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_vaas_api_keys_hash ON vaas_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_vaas_webhooks_org_id ON vaas_webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_vaas_webhook_deliveries_webhook_id ON vaas_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_vaas_audit_logs_org_id ON vaas_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_vaas_audit_logs_action ON vaas_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_vaas_audit_logs_created ON vaas_audit_logs(created_at);

-- ── Updated-at trigger function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (DROP IF EXISTS + CREATE to be idempotent)
DROP TRIGGER IF EXISTS update_vaas_organizations_updated_at ON vaas_organizations;
CREATE TRIGGER update_vaas_organizations_updated_at BEFORE UPDATE ON vaas_organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vaas_admins_updated_at ON vaas_admins;
CREATE TRIGGER update_vaas_admins_updated_at BEFORE UPDATE ON vaas_admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vaas_end_users_updated_at ON vaas_end_users;
CREATE TRIGGER update_vaas_end_users_updated_at BEFORE UPDATE ON vaas_end_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vaas_verification_sessions_updated_at ON vaas_verification_sessions;
CREATE TRIGGER update_vaas_verification_sessions_updated_at BEFORE UPDATE ON vaas_verification_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vaas_webhooks_updated_at ON vaas_webhooks;
CREATE TRIGGER update_vaas_webhooks_updated_at BEFORE UPDATE ON vaas_webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
