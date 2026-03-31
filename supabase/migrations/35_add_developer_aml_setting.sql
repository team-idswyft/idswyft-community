-- Add developer-level AML screening toggle.
-- Defaults to true: AML runs automatically when providers are configured.
-- Developers can set to false to opt out.

ALTER TABLE developers ADD COLUMN IF NOT EXISTS aml_enabled BOOLEAN DEFAULT true;
