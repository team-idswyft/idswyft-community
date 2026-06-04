-- Supabase-only migration. Self-skips on stock Postgres so community
-- self-hosters (STORAGE_PROVIDER=local) can run the migration set cleanly.
-- The runner catches SUPABASE_ONLY_MIGRATION_SKIPPED and records the
-- migration as applied without executing the body — see migrate.ts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'SUPABASE_ONLY_MIGRATION_SKIPPED'
      USING ERRCODE = 'P0001',
            HINT = 'Migration 53 manages Supabase Storage buckets; not applicable on stock Postgres.';
  END IF;
END $$;

-- Create a dedicated public bucket for developer branding assets (logos, etc.)
-- The identity-documents bucket is private (sensitive ID photos), so branding
-- logos uploaded there were inaccessible via public URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to all files in the branding bucket
DO $$ BEGIN
  CREATE POLICY "Public read access for branding"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow uploads to branding bucket (service_role key bypasses RLS, but needed for completeness)
DO $$ BEGIN
  CREATE POLICY "Insert branding assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'branding');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Update branding assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'branding');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
