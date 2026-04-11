-- Drop the unused "admins" security-definer view.
-- It exposes admin_users (including password_hash) to anon/authenticated
-- roles via the Supabase API, bypassing RLS on the underlying table.
-- The backend uses admin_users directly — this view is never referenced.
DROP VIEW IF EXISTS admins;
