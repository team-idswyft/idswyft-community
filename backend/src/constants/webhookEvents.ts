/**
 * Canonical catalog of webhook event types.
 * Both the backend (event filtering, validation) and the frontend
 * (event checklist with descriptions) should reference this list.
 */
export const WEBHOOK_EVENTS: Record<string, string> = {
  'verification.started':            'Verification session created',
  'verification.document_processed': 'Document step completed (front or back)',
  'verification.completed':          'Verification passed',
  'verification.failed':             'Verification rejected',
  'verification.manual_review':      'Flagged for manual review',
  'document.expiry_warning':         'Document nearing or past expiry date',
  'verification.reverification_due': 'Scheduled re-verification is due',
} as const;

/** All valid event names as a typed array */
export const WEBHOOK_EVENT_NAMES = Object.keys(WEBHOOK_EVENTS);
