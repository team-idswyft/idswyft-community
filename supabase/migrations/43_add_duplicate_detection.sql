-- 43: Add duplicate detection (document pHash + face LSH fingerprinting)

-- Developer settings
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS duplicate_detection_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_detection_action TEXT DEFAULT 'review'
    CHECK (duplicate_detection_action IN ('block', 'review', 'allow'));

-- Fingerprints table
CREATE TABLE IF NOT EXISTS dedup_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  fingerprint_type TEXT NOT NULL CHECK (fingerprint_type IN ('document_phash', 'face_lsh')),
  hash_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dedup_lookup
  ON dedup_fingerprints (developer_id, fingerprint_type, hash_value);
CREATE INDEX IF NOT EXISTS idx_dedup_vr_id
  ON dedup_fingerprints (verification_request_id);

-- Duplicate flags on verification request
ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS duplicate_flags JSONB DEFAULT NULL;
