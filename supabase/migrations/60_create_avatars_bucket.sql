-- Create a dedicated public bucket for developer profile avatars.
-- Previously avatars were written to the default `identity-documents` bucket
-- (which holds end-user passport / driver's-license images and is correctly
-- private), so the publicUrl returned by storePublicAsset always 404'd. They
-- also conflated developer profile pictures with end-user PII Category-9 data
-- in a single bucket — wrong on both functional and privacy axes.
--
-- This migration creates a separate public `avatars` bucket and patches the
-- backend to route uploads there (see backend/src/services/storage.ts).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to all files in the avatars bucket.
DO $$ BEGIN
  CREATE POLICY "Public read access for avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow uploads to avatars bucket (service_role bypasses RLS, but kept for
-- completeness — mirrors the branding-bucket policy set in migration 53).
DO $$ BEGIN
  CREATE POLICY "Insert avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Clean up rows whose avatar_url points at the wrong (identity-documents)
-- bucket. Those URLs return 404 from Supabase and have always been broken.
-- Setting them to NULL renders the placeholder UserCircleIcon until the
-- developer re-uploads, which is strictly better than a permanent 404.
-- Idempotent — re-running matches zero rows after first apply.
UPDATE developers
SET avatar_url = NULL
WHERE avatar_url LIKE
  'https://%.supabase.co/storage/v1/object/public/identity-documents/avatars/%';

-- Best-effort cleanup of orphan avatar BYTES that were misrouted into the
-- private identity-documents bucket. Bucket structure is { documents/,
-- selfies/, avatars/ }; only avatars/ is misrouted — verification documents
-- and live captures stay untouched. Filter is prefix-scoped so documents/
-- and selfies/ can never be matched.
--
-- Supabase installs a `storage.protect_delete()` trigger that blocks raw-SQL
-- DELETE on storage.objects (errcode insufficient_privilege / 42501) and
-- requires the Storage API instead. We attempt the DELETE inside a guard so
-- the migration succeeds either way; on a project where the trigger is
-- present the orphans must be cleaned via the Storage REST API or Studio
-- dashboard. With a fresh install there are no orphans, so the no-op is fine.
DO $$ BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'identity-documents'
    AND name LIKE 'avatars/%';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Direct DELETE on storage.objects is blocked by storage.protect_delete(). Clean orphan avatars via the Storage API or Supabase Studio.';
END $$;
