-- Backfill NULL events on existing webhooks to subscribe to all event types.
-- The query-time fix in webhook.ts already treats NULL as "all events",
-- but this cleans up legacy data for consistency.
UPDATE webhooks
SET events = ARRAY[
  'verification.started',
  'verification.document_processed',
  'verification.completed',
  'verification.failed',
  'verification.manual_review',
  'document.expiry_warning',
  'verification.reverification_due'
]
WHERE events IS NULL;
