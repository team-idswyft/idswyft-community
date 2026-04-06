-- Store the signed JWT string so credentials can be re-sent without re-signing
ALTER TABLE verifiable_credentials
  ADD COLUMN IF NOT EXISTS credential_jwt TEXT;
