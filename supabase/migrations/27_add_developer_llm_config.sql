-- Add LLM provider configuration columns to developers table.
-- Developers can optionally configure their own LLM API key for
-- enhanced OCR extraction (GPT-4o Vision / Claude Vision / custom endpoint).

ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS llm_provider TEXT CHECK (llm_provider IN ('openai', 'anthropic', 'custom')),
  ADD COLUMN IF NOT EXISTS llm_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS llm_endpoint_url TEXT;

COMMENT ON COLUMN developers.llm_provider IS 'LLM provider for OCR enhancement: openai, anthropic, or custom';
COMMENT ON COLUMN developers.llm_api_key_encrypted IS 'AES-256-GCM encrypted API key for the chosen LLM provider';
COMMENT ON COLUMN developers.llm_endpoint_url IS 'Custom LLM endpoint URL (only used when llm_provider = custom)';
