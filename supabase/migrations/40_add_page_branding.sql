-- Page branding: let developers white-label the hosted verification page
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS branding_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS branding_accent_color TEXT,
  ADD COLUMN IF NOT EXISTS branding_company_name TEXT;

DO $$ BEGIN
  ALTER TABLE developers
    ADD CONSTRAINT developers_branding_accent_color_hex
    CHECK (branding_accent_color IS NULL OR branding_accent_color ~ '^#[0-9a-fA-F]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
