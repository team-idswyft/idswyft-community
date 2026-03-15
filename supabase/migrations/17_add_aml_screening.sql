-- AML/Sanctions Screening table
-- Stores screening results for audit trail and compliance reporting

CREATE TABLE IF NOT EXISTS aml_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID REFERENCES verification_requests(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT,
  nationality TEXT,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'clear',
  match_found BOOLEAN NOT NULL DEFAULT false,
  matches JSONB DEFAULT '[]',
  lists_checked TEXT[] DEFAULT '{}',
  screened_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_screenings_verification ON aml_screenings(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_aml_screenings_risk ON aml_screenings(risk_level);
