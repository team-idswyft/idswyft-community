-- Migration: Add issuing_country (ISO alpha-2) to documents and verification_requests
-- Supports international ID verification by tracking document origin country.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS issuing_country VARCHAR(2);
CREATE INDEX IF NOT EXISTS idx_documents_issuing_country ON documents(issuing_country);

ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS issuing_country VARCHAR(2);
