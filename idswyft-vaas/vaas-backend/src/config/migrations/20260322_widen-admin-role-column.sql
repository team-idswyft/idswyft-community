-- Widen the role column from VARCHAR(20) to VARCHAR(50) to support longer role
-- names like 'verification_reviewer'.  Also drop the old CHECK constraint (if it
-- exists) and recreate with the full set of allowed roles.

ALTER TABLE vaas_admins ALTER COLUMN role TYPE VARCHAR(50);

-- Drop legacy CHECK constraint (name varies depending on which DDL created the table)
DO $$ BEGIN
  ALTER TABLE vaas_admins DROP CONSTRAINT IF EXISTS vaas_admins_role_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE vaas_admins ADD CONSTRAINT vaas_admins_role_check
  CHECK (role IN ('owner', 'admin', 'operator', 'verification_reviewer', 'viewer'));
