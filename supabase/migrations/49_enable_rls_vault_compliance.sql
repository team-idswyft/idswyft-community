-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS on identity vault and compliance tables
-- ─────────────────────────────────────────────────────────────────────────────
-- These tables were added in migrations 46 and 48 without RLS.
-- Same defense-in-depth rationale as migration 34.
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity Vault (46)
ALTER TABLE identity_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_share_links ENABLE ROW LEVEL SECURITY;

-- Compliance Engine (48)
ALTER TABLE compliance_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
