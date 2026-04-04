-- Page Builder: JSONB config column + custom verification slug
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS page_builder_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_slug TEXT DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_verification_slug
  ON developers (verification_slug) WHERE verification_slug IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE developers
    ADD CONSTRAINT developers_verification_slug_format
    CHECK (verification_slug IS NULL OR verification_slug ~ '^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
