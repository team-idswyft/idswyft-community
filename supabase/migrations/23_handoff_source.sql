-- Thread verification source through mobile handoff sessions
-- so the mobile device creates the verification with the correct source tag.
ALTER TABLE mobile_handoff_sessions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'api';
