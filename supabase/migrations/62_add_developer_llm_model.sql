-- 62: Add the LLM model name to the developer LLM configuration
--
-- OpenAI and Anthropic have a built-in default model, but a custom
-- OpenAI-compatible endpoint (Gemini, OpenRouter, vLLM, …) rejects a request
-- without an explicit `model`, which made every LLM OCR fallback fail with
-- `400 model is not specified`.

ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS llm_model TEXT;

COMMENT ON COLUMN developers.llm_model IS 'Model name sent to the LLM provider. Required for llm_provider = custom; optional override for openai/anthropic';
