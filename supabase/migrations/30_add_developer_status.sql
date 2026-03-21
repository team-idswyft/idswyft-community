-- Add status column to developers table for suspend/unsuspend functionality
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));
