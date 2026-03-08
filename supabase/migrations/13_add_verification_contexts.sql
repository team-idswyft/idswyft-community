-- Persistent verification context store
-- Replaces the in-memory Map in VerificationStateStore so state survives deploys.
-- The full VerificationContext is stored as JSONB for schema flexibility.
-- The backend uses this as a write-through cache: Map for fast in-process reads,
-- Postgres for durability across restarts.

CREATE TABLE IF NOT EXISTS verification_contexts (
  verification_id  UUID        PRIMARY KEY,
  context          JSONB       NOT NULL DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_contexts_updated_at_idx
  ON verification_contexts (updated_at);

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION update_verification_contexts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verification_contexts_updated_at
  BEFORE UPDATE ON verification_contexts
  FOR EACH ROW EXECUTE FUNCTION update_verification_contexts_updated_at();
