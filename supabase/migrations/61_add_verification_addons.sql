-- 61: Add the per-verification addons column
--
-- The pipeline has always written and read `verification_requests.addons`
-- (AML screening toggle, address verification, compliance decisions), but no
-- migration ever created the column. Every status read logged
-- `column "addons" does not exist` and silently lost the compliance flags.

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT NULL;

COMMENT ON COLUMN verification_requests.addons IS 'Per-verification add-ons and compliance decisions (aml_screening, address_verification, compliance_force_manual_review)';
