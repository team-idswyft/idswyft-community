-- Compliance Orchestration Engine: developer-configurable rule engine

CREATE TABLE IF NOT EXISTS compliance_rulesets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rulesets_dev ON compliance_rulesets(developer_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rulesets_active ON compliance_rulesets(developer_id, is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id UUID NOT NULL REFERENCES compliance_rulesets(id) ON DELETE CASCADE,
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_ruleset ON compliance_rules(ruleset_id);
