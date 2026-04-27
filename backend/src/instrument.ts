import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const isProduction = process.env.NODE_ENV === 'production';
const sentryDsn = process.env.SENTRY_DSN;

// Field names that may contain PII or biometric data. Compared case-insensitively.
const PII_FIELDS = new Set([
  'email',
  'first_name',
  'last_name',
  'full_name',
  'name',
  'dob',
  'date_of_birth',
  'document_number',
  'document_id',
  'address',
  'street',
  'city',
  'postal_code',
  'phone',
  'phone_number',
  'mrz',
  'mrz_data',
  'barcode_data',
  'ocr_data',
  'ocr_text',
  'face_embedding',
  'speaker_embedding',
  'ssn',
  'national_id',
  'license_number',
  'passport_number',
]);

// Headers that authenticate or identify a session — never ship to Sentry.
const SENSITIVE_HEADERS = [
  'x-api-key',
  'x-handoff-token',
  'x-session-token',
  'x-service-token',
  'authorization',
  'cookie',
  'set-cookie',
];

/**
 * Recursively redact PII field values in any object/array. Mutates in place.
 * Uses a WeakSet to short-circuit on circular references — Sentry event
 * payloads contain them (event.contexts.os ↔ event.contexts.runtime).
 */
export function redactPII(obj: any, seen: WeakSet<object> = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') redactPII(item, seen);
    }
    return obj;
  }

  for (const key of Object.keys(obj)) {
    if (PII_FIELDS.has(key.toLowerCase())) {
      obj[key] = '[redacted]';
    } else if (obj[key] && typeof obj[key] === 'object') {
      redactPII(obj[key], seen);
    }
  }
  return obj;
}

/**
 * Scrub a Sentry event payload before transmission. Removes:
 *  - request body (most likely vector for OCR data, image buffers, form fields)
 *  - sensitive headers (auth tokens, cookies)
 *  - PII field values anywhere in extra/contexts/breadcrumbs
 *
 * This is defense-in-depth on top of `sendDefaultPii: false`. The flag stops
 * Sentry from auto-collecting request data; this function catches anything
 * added explicitly via Sentry.setContext / setExtra / addBreadcrumb.
 */
export function scrubSentryEvent(event: any): any {
  if (!event) return event;

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers && typeof event.request.headers === 'object') {
      for (const h of SENSITIVE_HEADERS) {
        delete event.request.headers[h];
        delete event.request.headers[h.toUpperCase()];
      }
    }
    delete event.request.query_string;
  }

  redactPII(event.extra);
  redactPII(event.contexts);
  redactPII(event.breadcrumbs);
  redactPII(event.tags);

  return event;
}

if (isProduction && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      nodeProfilingIntegration(),
    ],
    enableLogs: true,
    tracesSampleRate: 1.0,
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        return scrubSentryEvent(event);
      } catch {
        return null;
      }
    },
  });
}
