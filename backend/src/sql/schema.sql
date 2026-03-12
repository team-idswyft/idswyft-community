-- Idswyft Identity Verification Platform Database Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Developers table (for API key management)
CREATE TABLE IF NOT EXISTS developers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    webhook_url TEXT,
    sandbox_webhook_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_sandbox BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Verification requests table
CREATE TABLE IF NOT EXISTS verification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'manual_review')),
    document_id UUID,
    selfie_id UUID,
    ocr_data JSONB,
    face_match_score DECIMAL(5,4),
    manual_review_reason TEXT,
    external_verification_id VARCHAR(255),
    is_sandbox BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('passport', 'drivers_license', 'national_id', 'other')),
    ocr_extracted BOOLEAN DEFAULT FALSE,
    quality_score DECIMAL(5,4),
    authenticity_score DECIMAL(5,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Selfies table
CREATE TABLE IF NOT EXISTS selfies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    liveness_score DECIMAL(5,4),
    face_detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    is_sandbox BOOLEAN DEFAULT FALSE,
    secret_token VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    response_status INTEGER,
    response_body TEXT,
    attempts INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,
    identifier_type VARCHAR(20) NOT NULL CHECK (identifier_type IN ('user', 'developer', 'ip')),
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_until TIMESTAMP WITH TIME ZONE,
    UNIQUE(identifier, identifier_type, window_start)
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'reviewer' CHECK (role IN ('admin', 'reviewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data audit table (for GDPR compliance)
CREATE TABLE IF NOT EXISTS data_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'accessed')),
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('user', 'developer', 'admin', 'system')),
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update foreign key references
ALTER TABLE verification_requests ADD CONSTRAINT fk_verification_document 
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE verification_requests ADD CONSTRAINT fk_verification_selfie 
    FOREIGN KEY (selfie_id) REFERENCES selfies(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_developers_email ON developers(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_developer ON api_keys(developer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_verification_user ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_developer ON verification_requests(developer_id);
CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_created ON verification_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_verification ON documents(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_selfies_verification ON selfies(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_developer ON webhooks(developer_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_verification ON webhook_deliveries(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier, identifier_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON data_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON data_audit_log(created_at);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_developers_updated_at BEFORE UPDATE ON developers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_requests_updated_at BEFORE UPDATE ON verification_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update verification status
CREATE OR REPLACE FUNCTION update_verification_status()
RETURNS TRIGGER AS $$
DECLARE
    doc_exists BOOLEAN := FALSE;
    selfie_exists BOOLEAN := FALSE;
    face_match_good BOOLEAN := FALSE;
BEGIN
    -- Check if document exists and is processed
    SELECT EXISTS(
        SELECT 1 FROM documents 
        WHERE verification_request_id = NEW.id 
        AND ocr_extracted = TRUE 
        AND quality_score > 0.7
    ) INTO doc_exists;
    
    -- Check if selfie exists and face was detected
    SELECT EXISTS(
        SELECT 1 FROM selfies 
        WHERE verification_request_id = NEW.id 
        AND face_detected = TRUE
    ) INTO selfie_exists;
    
    -- Check if face match score is good
    face_match_good := (NEW.face_match_score IS NULL OR NEW.face_match_score > 0.85);
    
    -- Update status based on conditions
    IF doc_exists AND (NOT selfie_exists OR (selfie_exists AND face_match_good)) THEN
        NEW.status := 'verified';
    ELSIF doc_exists AND selfie_exists AND NOT face_match_good THEN
        NEW.status := 'failed';
        NEW.manual_review_reason := 'Face match score too low';
    ELSIF NEW.status = 'pending' AND (
        SELECT quality_score FROM documents 
        WHERE verification_request_id = NEW.id 
        ORDER BY created_at DESC LIMIT 1
    ) < 0.5 THEN
        NEW.status := 'manual_review';
        NEW.manual_review_reason := 'Document quality too low';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_verification_status 
    BEFORE UPDATE ON verification_requests 
    FOR EACH ROW EXECUTE FUNCTION update_verification_status();

-- Function for data audit logging
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO data_audit_log (table_name, record_id, action)
    VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), 
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'created'
            WHEN TG_OP = 'UPDATE' THEN 'updated'
            WHEN TG_OP = 'DELETE' THEN 'deleted'
        END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Add audit triggers to sensitive tables
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users 
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_verification_requests AFTER INSERT OR UPDATE OR DELETE ON verification_requests 
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON documents 
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_selfies AFTER INSERT OR UPDATE OR DELETE ON selfies 
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- RLS (Row Level Security) policies for multi-tenancy
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE selfies ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Create policies (will be defined based on authentication context)
-- These are placeholder policies that will be refined based on the authentication implementation

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create initial admin user (password: 'admin123' - change in production)
INSERT INTO admin_users (email, password_hash, role) 
VALUES ('admin@idswyft.app', crypt('admin123', gen_salt('bf')), 'admin')
ON CONFLICT (email) DO NOTHING;