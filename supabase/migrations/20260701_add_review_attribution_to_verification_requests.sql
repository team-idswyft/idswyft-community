-- ─────────────────────────────────────────────────
-- Review attribution for verification_requests
-- ─────────────────────────────────────────────────
-- Records WHO manually reviewed a verification and WHEN. Populated by the
-- admin/reviewer/operator review action (approve / reject / override).
--
-- These columns were already referenced by the admin override handler
-- (routes/admin.ts) but never existed in the schema, so overrides silently
-- failed the UPDATE in production. This migration adds them and unblocks the
-- Phase 4 operator-review attribution (reviewed_by = operator email).
--
-- Both nullable, no default → metadata-only ALTER, no table rewrite; existing
-- rows stay NULL (no backfill). Ships to both editions.
--
-- reviewed_by is TEXT (not a UUID FK): the actor may be an admin id, a reviewer
-- id, or a service-operator email — a free-form attribution label, not a
-- foreign key into any single table.
-- ─────────────────────────────────────────────────

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN verification_requests.reviewed_by IS
  'Attribution for a manual review decision: admin id, reviewer id, or service-operator email. NULL until manually reviewed.';
COMMENT ON COLUMN verification_requests.reviewed_at IS
  'Timestamp of the manual review decision. NULL until manually reviewed.';
