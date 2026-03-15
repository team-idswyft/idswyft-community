-- Migration: Add risk scores table for verification analytics
-- Feature 4: Analytics & Risk Scoring

CREATE TABLE IF NOT EXISTS verification_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID UNIQUE REFERENCES verification_requests(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  risk_factors JSONB DEFAULT '[]',
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_level ON verification_risk_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_scores_verification ON verification_risk_scores(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_computed_at ON verification_risk_scores(computed_at);

-- Add timing columns to verification_requests for processing-time analytics
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;
