/**
 * Sentry event scrubber. Redacts PII and biometric data before transmission.
 *
 * Used by both the backend API (`backend/src/instrument.ts`) and the engine
 * (`engine/src/instrument.ts`). Both surfaces process biometric and identity
 * data; an unscrubbed Sentry event from either is a GDPR Article 9 incident.
 *
 * Operates on plain JS objects — no Sentry SDK types imported, so this module
 * has zero runtime dependency on @sentry/node.
 */

/** Field names whose values are redacted regardless of where they appear. Compared case-insensitively. */
export const PII_FIELDS: ReadonlySet<string> = new Set([
  // Identity
  'email',
  'first_name',
  'last_name',
  'full_name',
  'name',
  'middle_name',
  'dob',
  'date_of_birth',
  'place_of_birth',
  'nationality',
  // Document data
  'document_number',
  'document_id',
  'id_number',
  'license_number',
  'passport_number',
  'national_id',
  'ssn',
  'expiration_date',
  'expiry_date',
  'issue_date',
  // Address
  'address',
  'street',
  'city',
  'postal_code',
  'zip',
  'zip_code',
  // Contact
  'phone',
  'phone_number',
  // Document parsing artifacts (highest leakage)
  'raw_text',
  'mrz',
  'mrz_data',
  'barcode_data',
  'aamva_data',
  'pdf417_data',
  'ocr_data',
  'ocr_text',
  'extracted_fields',
  'extracted_data',
  // File URLs (signed URLs that grant access)
  'image_url',
  'live_image_url',
  'selfie_url',
  'document_url',
  'file_url',
  // Auth & secrets (defense in depth)
  'otp_code',
  'verification_code',
  'api_key',
  'secret',
  'token',
  'password',
  'bearer',
  // Biometric embeddings
  'face_embedding',
  'speaker_embedding',
  // Cross-developer correlation IDs (don't leak across tenants)
  'external_user_id',
  'end_user_id',
]);

/** Headers that authenticate a session — never ship to Sentry. Compared case-insensitively. */
const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  'x-api-key',
  'x-handoff-token',
  'x-session-token',
  'x-service-token',
  'x-csrf-token',
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

/** Free-text patterns redacted from event.message and similar string fields. */
const TEXT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Emails
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]'],
  // ISO dates: 2024-01-15
  [/\b\d{4}-\d{2}-\d{2}\b/g, '[date]'],
  // Slash dates: 01/15/2024 or 15/01/2024
  [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[date]'],
  // Mixed alphanumeric IDs (6-20 chars, must contain both letter and digit)
  // Avoids matching pure hex UUIDs (lowercase) and HTTP status codes.
  [/\b(?=[A-Z0-9]{6,20}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g, '[id]'],
  // Long pure-digit sequences (likely doc numbers, phone numbers, SSN). Skips short numbers.
  [/\b\d{8,15}\b/g, '[id]'],
];

/**
 * Apply free-text PII patterns to a string. Returns the redacted string.
 * Safe for primitives — non-string input is returned unchanged.
 */
export function scrubText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let result = value;
  for (const [pattern, replacement] of TEXT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

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
 *  - request body / query string / cookies
 *  - sensitive headers (case-insensitive)
 *  - PII field values anywhere in extra/contexts/breadcrumbs/tags/user
 *  - free-text PII patterns from event.message, exception values, breadcrumb messages
 *  - stack-frame local variables (defense-in-depth against sendDefaultPii regression)
 *
 * Returns the scrubbed event, or a minimal stub if scrubbing throws — never
 * the original event with PII intact.
 */
export function scrubSentryEvent(event: any): any {
  if (!event) return event;

  try {
    // 1. Strip request internals
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.query_string;
      if (event.request.headers && typeof event.request.headers === 'object') {
        for (const headerKey of Object.keys(event.request.headers)) {
          if (SENSITIVE_HEADERS.has(headerKey.toLowerCase())) {
            delete event.request.headers[headerKey];
          }
        }
      }
    }

    // 2. Field-name-based redaction
    redactPII(event.extra);
    redactPII(event.contexts);
    redactPII(event.breadcrumbs);
    redactPII(event.tags);
    redactPII(event.user);

    // 3. Free-text scrubbing on string fields where PII gets interpolated
    if (typeof event.message === 'string') {
      event.message = scrubText(event.message);
    }
    if (event.exception?.values && Array.isArray(event.exception.values)) {
      for (const exc of event.exception.values) {
        if (exc && typeof exc.value === 'string') {
          exc.value = scrubText(exc.value);
        }
        // Stack-frame local variables — Sentry includes these when sendDefaultPii=true
        // is set or when explicitly captured. Belt-and-suspenders: redact regardless.
        const frames = exc?.stacktrace?.frames;
        if (Array.isArray(frames)) {
          for (const frame of frames) {
            if (frame?.vars) redactPII(frame.vars);
          }
        }
      }
    }
    if (Array.isArray(event.breadcrumbs)) {
      for (const crumb of event.breadcrumbs) {
        if (crumb && typeof crumb.message === 'string') {
          crumb.message = scrubText(crumb.message);
        }
      }
    }

    // 4. event.transaction is the route name — usually safe but
    // /users/alice@example.com style routes leak. Scrub free-text patterns.
    if (typeof event.transaction === 'string') {
      event.transaction = scrubText(event.transaction) as string;
    }

    // 5. event.fingerprint is a user-supplied grouping key (string array).
    // Code that calls Sentry.withScope(s => s.setFingerprint([err.message]))
    // can inject raw error text — scrub each string entry.
    if (Array.isArray(event.fingerprint)) {
      event.fingerprint = event.fingerprint.map((f: unknown) =>
        typeof f === 'string' ? scrubText(f) : f,
      );
    }

    return event;
  } catch {
    // Scrubber failure must never let the original event through.
    // Return a stub that preserves correlation fields (event_id, transaction,
    // release, environment) so ops can still group and trace, but no PII.
    // Inner try/catch in case the original event has throwing getters.
    try {
      return {
        event_id: event?.event_id,
        transaction: event?.transaction,
        level: event?.level ?? 'error',
        release: event?.release,
        environment: event?.environment,
        platform: event?.platform,
        message: '[scrubber_error] event suppressed to prevent PII leak',
        tags: { scrubber: 'failed' },
      };
    } catch {
      return {
        message: '[scrubber_error] event suppressed to prevent PII leak',
        level: 'error',
        tags: { scrubber: 'failed' },
      };
    }
  }
}
