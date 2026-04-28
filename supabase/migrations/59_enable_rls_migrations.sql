-- Enable RLS on public._migrations + service-role-only policy.
--
-- Closes the Supabase lint finding "RLS Disabled in Public" for the
-- migration tracking table. Pattern mirrors migration 57, which did
-- the same for every other public.* table at the time. _migrations
-- was created by the migrate.ts runner outside of any migration file,
-- so it never had the RLS treatment until now.
--
-- service_role bypasses RLS, so the migrate.ts runner (which uses the
-- direct DB URL with service-role privileges) is unaffected. Anon and
-- authenticated PostgREST requests are denied (no policy = no access).
--
-- Defense in depth: the explicit REVOKE makes the lockdown durable
-- even in scenarios where RLS is briefly disabled (e.g. point-in-time
-- restores from before this migration ran).

ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_migrations ON public._migrations;
CREATE POLICY service_role_all_migrations
  ON public._migrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Lock down the GRANTs explicitly. These should already be absent on a
-- fresh DB (service_role is the only role that owns the table), but
-- some Supabase project templates default-grant SELECT to anon, so we
-- revoke unconditionally.
REVOKE ALL ON public._migrations FROM anon;
REVOKE ALL ON public._migrations FROM authenticated;
