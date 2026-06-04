-- Migration 41: backfill webhook_deliveries.id default to gen_random_uuid()
--
-- Migration 20260319_add_webhook_deliveries.sql originally used
-- uuid_generate_v4() which requires the uuid-ossp extension — not installed
-- by default on stock Postgres. v1.12.8 changed that migration's SQL to use
-- gen_random_uuid() so NEW self-host installations work cleanly without the
-- extension, but installations where 20260319 was already applied
-- (cloud production on Supabase, or self-hosters who installed uuid-ossp
-- manually) still have the old DEFAULT recorded on the column.
--
-- This migration brings existing installations to parity. ALTER COLUMN
-- SET DEFAULT is metadata-only (no table rewrite, no row scan), takes a
-- brief ACCESS EXCLUSIVE lock on the system catalog only. Existing rows
-- that were INSERTed under uuid_generate_v4() keep their UUIDs unchanged
-- — UUIDs are UUIDs regardless of which function generated them.
--
-- After this migration applies, all installations (new and existing)
-- converge on gen_random_uuid() and the uuid-ossp extension becomes
-- optional on self-host Postgres deployments.

ALTER TABLE webhook_deliveries
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
