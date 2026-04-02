-- 39_admin_restructure.sql
-- Separate org admin from reviewer role on verification_reviewers.
-- Org admins can manage reviewers, access analytics, and handle GDPR.
-- Reviewers can only approve/reject verifications.

-- Add role column to verification_reviewers
ALTER TABLE verification_reviewers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'reviewer';

-- Add CHECK constraint (idempotent)
DO $$ BEGIN
  ALTER TABLE verification_reviewers
    ADD CONSTRAINT verification_reviewers_role_check CHECK (role IN ('reviewer', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for role queries
CREATE INDEX IF NOT EXISTS idx_verification_reviewers_role ON verification_reviewers(role);
