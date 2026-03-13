-- Add configurable from_email to platform email config
-- Allows platform admins to set the sender address for all outbound emails

ALTER TABLE platform_email_config
  ADD COLUMN IF NOT EXISTS from_email TEXT DEFAULT 'noreply@mail.idswyft.app';
