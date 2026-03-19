-- Per-API-Key Webhook Scoping
-- Allows webhooks to be optionally scoped to a specific API key.
-- NULL api_key_id means "fire for all keys" (backward compatible).
-- ON DELETE SET NULL: if the API key is revoked, the webhook stays active but becomes unscoped.

ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_webhooks_api_key_id ON webhooks(api_key_id);
