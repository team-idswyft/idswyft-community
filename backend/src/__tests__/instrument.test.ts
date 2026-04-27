import { describe, it, expect } from 'vitest';
import { redactPII, scrubSentryEvent, scrubText } from '../instrument.js';

describe('redactPII', () => {
  it('redacts top-level PII field values', () => {
    const obj = { email: 'a@b.com', first_name: 'Alice', other: 'keep' };
    redactPII(obj);
    expect(obj.email).toBe('[redacted]');
    expect(obj.first_name).toBe('[redacted]');
    expect(obj.other).toBe('keep');
  });

  it('redacts nested PII field values', () => {
    const obj = {
      user: {
        profile: { last_name: 'Smith', dob: '1990-01-01' },
        meta: { keep: 'me' },
      },
    };
    redactPII(obj);
    expect(obj.user.profile.last_name).toBe('[redacted]');
    expect(obj.user.profile.dob).toBe('[redacted]');
    expect(obj.user.meta.keep).toBe('me');
  });

  it('redacts PII inside arrays', () => {
    const obj = {
      list: [
        { document_number: 'X123', other: 'a' },
        { document_number: 'Y456', other: 'b' },
      ],
    };
    redactPII(obj);
    expect(obj.list[0].document_number).toBe('[redacted]');
    expect(obj.list[1].document_number).toBe('[redacted]');
    expect(obj.list[0].other).toBe('a');
  });

  it('matches field names case-insensitively', () => {
    const obj = { Email: 'a@b.com', DOB: '1990', First_Name: 'Bob' };
    redactPII(obj);
    expect(obj.Email).toBe('[redacted]');
    expect(obj.DOB).toBe('[redacted]');
    expect(obj.First_Name).toBe('[redacted]');
  });

  it('does not infinite-loop on circular references', () => {
    const a: any = { name: 'Alice', email: 'a@b.com' };
    const b: any = { back: a };
    a.forward = b;
    expect(() => redactPII(a)).not.toThrow();
    expect(a.email).toBe('[redacted]');
    expect(a.name).toBe('[redacted]');
  });

  it('handles null and primitive inputs without throwing', () => {
    expect(() => redactPII(null)).not.toThrow();
    expect(() => redactPII(undefined)).not.toThrow();
    expect(() => redactPII('string')).not.toThrow();
    expect(() => redactPII(42)).not.toThrow();
  });

  it('preserves non-PII keys with object values', () => {
    const obj = { config: { timeout: 5000, retries: 3 } };
    redactPII(obj);
    expect(obj.config.timeout).toBe(5000);
    expect(obj.config.retries).toBe(3);
  });

  it('redacts the highest-leakage field names from this codebase', () => {
    const obj = {
      raw_text: 'NAME: ALICE EXAMPLE\nDOB: 1990-01-01\nDLN: X1234567',
      aamva_data: { dln: 'X1234567' },
      pdf417_data: 'PDF417 raw',
      external_user_id: 'ext-abc',
      end_user_id: 'eu-123',
      selfie_url: 'https://signed.example/selfie.jpg',
      otp_code: '123456',
    };
    redactPII(obj);
    expect(obj.raw_text).toBe('[redacted]');
    expect(obj.aamva_data).toBe('[redacted]');
    expect(obj.pdf417_data).toBe('[redacted]');
    expect(obj.external_user_id).toBe('[redacted]');
    expect(obj.end_user_id).toBe('[redacted]');
    expect(obj.selfie_url).toBe('[redacted]');
    expect(obj.otp_code).toBe('[redacted]');
  });
});

describe('scrubText (free-text patterns)', () => {
  it('redacts emails', () => {
    expect(scrubText('contact alice@example.com please')).toBe('contact [email] please');
  });

  it('redacts ISO and slash dates', () => {
    expect(scrubText('born 1990-01-15')).toBe('born [date]');
    expect(scrubText('born 01/15/1990')).toBe('born [date]');
  });

  it('redacts mixed alphanumeric IDs', () => {
    expect(scrubText('docnum X1234567 found')).toBe('docnum [id] found');
  });

  it('redacts long pure-digit sequences', () => {
    expect(scrubText('phone 5551234567 here')).toBe('phone [id] here');
  });

  it('does not mangle UUIDs (lowercase hex with dashes)', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
    expect(scrubText(`request id=${uuid}`)).toBe(`request id=${uuid}`);
  });

  it('does not redact short numbers like HTTP status codes', () => {
    expect(scrubText('returned 404 status')).toBe('returned 404 status');
    expect(scrubText('took 1500ms')).toBe('took 1500ms');
  });

  it('returns non-strings unchanged', () => {
    expect(scrubText(42)).toBe(42);
    expect(scrubText(null)).toBe(null);
    expect(scrubText(undefined)).toBe(undefined);
  });
});

describe('scrubSentryEvent', () => {
  it('removes request body', () => {
    const event: any = {
      request: { data: { first_name: 'Alice', document_number: 'X123' } },
    };
    scrubSentryEvent(event);
    expect(event.request.data).toBeUndefined();
  });

  it('strips sensitive headers regardless of casing', () => {
    const event: any = {
      request: {
        headers: {
          'x-api-key': 'ik_secret',
          'X-Api-Key': 'ik_secret_titlecase',
          'X-API-KEY': 'ik_secret_upper',
          'Authorization': 'Bearer abc',
          'Cookie': 'session=xyz',
          'user-agent': 'keep-me',
        },
      },
    };
    scrubSentryEvent(event);
    expect(event.request.headers['x-api-key']).toBeUndefined();
    expect(event.request.headers['X-Api-Key']).toBeUndefined();
    expect(event.request.headers['X-API-KEY']).toBeUndefined();
    expect(event.request.headers['Authorization']).toBeUndefined();
    expect(event.request.headers['Cookie']).toBeUndefined();
    expect(event.request.headers['user-agent']).toBe('keep-me');
  });

  it('redacts PII in event.extra', () => {
    const event: any = {
      extra: {
        verification: {
          ocr_data: { name: 'Alice', dob: '1990-01-01' },
          quality_score: 0.95,
        },
      },
    };
    scrubSentryEvent(event);
    expect(event.extra.verification.ocr_data).toBe('[redacted]');
    expect(event.extra.verification.quality_score).toBe(0.95);
  });

  it('redacts PII in event.contexts', () => {
    const event: any = {
      contexts: { user: { email: 'a@b.com', id: 'u123' } },
    };
    scrubSentryEvent(event);
    expect(event.contexts.user.email).toBe('[redacted]');
    expect(event.contexts.user.id).toBe('u123');
  });

  it('redacts PII inside breadcrumb data', () => {
    const event: any = {
      breadcrumbs: [
        { category: 'http', data: { email: 'a@b.com' }, message: 'request' },
      ],
    };
    scrubSentryEvent(event);
    expect(event.breadcrumbs[0].data.email).toBe('[redacted]');
  });

  it('redacts PII in event.user (Sentry.setUser context)', () => {
    const event: any = {
      user: { email: 'a@b.com', id: 'u123', ip_address: '1.2.3.4' },
    };
    scrubSentryEvent(event);
    expect(event.user.email).toBe('[redacted]');
    expect(event.user.id).toBe('u123');
  });

  it('removes query_string and cookies from request', () => {
    const event: any = {
      request: {
        query_string: 'token=abc&email=a@b.com',
        cookies: { session: 'xyz' },
      },
    };
    scrubSentryEvent(event);
    expect(event.request.query_string).toBeUndefined();
    expect(event.request.cookies).toBeUndefined();
  });

  it('handles missing request gracefully', () => {
    const event: any = { extra: { email: 'a@b.com' } };
    expect(() => scrubSentryEvent(event)).not.toThrow();
    expect(event.extra.email).toBe('[redacted]');
  });

  it('handles null/undefined event', () => {
    expect(() => scrubSentryEvent(null)).not.toThrow();
    expect(() => scrubSentryEvent(undefined)).not.toThrow();
  });

  it('scrubs PII patterns from event.message', () => {
    const event: any = {
      message: 'User alice@example.com failed verification with doc X1234567 on 2024-01-15',
    };
    scrubSentryEvent(event);
    expect(event.message).not.toContain('alice@example.com');
    expect(event.message).not.toContain('X1234567');
    expect(event.message).not.toContain('2024-01-15');
    expect(event.message).toContain('[email]');
    expect(event.message).toContain('[id]');
    expect(event.message).toContain('[date]');
  });

  it('scrubs PII from event.exception.values[].value', () => {
    const event: any = {
      exception: {
        values: [
          { type: 'Error', value: 'Engine extraction failed: name=Alice doc=X1234567' },
        ],
      },
    };
    scrubSentryEvent(event);
    expect(event.exception.values[0].value).not.toContain('X1234567');
    expect(event.exception.values[0].value).toContain('[id]');
  });

  it('scrubs breadcrumb messages (not just data)', () => {
    const event: any = {
      breadcrumbs: [
        { category: 'http', message: 'GET /verify?email=a@b.com&id=X1234567' },
      ],
    };
    scrubSentryEvent(event);
    expect(event.breadcrumbs[0].message).not.toContain('a@b.com');
    expect(event.breadcrumbs[0].message).not.toContain('X1234567');
  });

  it('redacts stack-frame local variables (defense-in-depth)', () => {
    const event: any = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'oops',
            stacktrace: {
              frames: [
                { filename: 'a.ts', vars: { email: 'a@b.com', timeout: 5000 } },
              ],
            },
          },
        ],
      },
    };
    scrubSentryEvent(event);
    expect(event.exception.values[0].stacktrace.frames[0].vars.email).toBe('[redacted]');
    expect(event.exception.values[0].stacktrace.frames[0].vars.timeout).toBe(5000);
  });

  it('scrubs PII patterns from event.transaction (route name)', () => {
    const event: any = { transaction: 'GET /users/alice@example.com/profile' };
    scrubSentryEvent(event);
    expect(event.transaction).not.toContain('alice@example.com');
    expect(event.transaction).toContain('[email]');
  });

  it('scrubs PII patterns from event.fingerprint entries', () => {
    const event: any = {
      fingerprint: ['error', 'User alice@example.com failed', 42],
    };
    scrubSentryEvent(event);
    expect(event.fingerprint[0]).toBe('error');
    expect(event.fingerprint[1]).not.toContain('alice@example.com');
    expect(event.fingerprint[1]).toContain('[email]');
    // Non-string entries pass through unchanged
    expect(event.fingerprint[2]).toBe(42);
  });

  it('returns a stub event (not the original) if scrubbing throws', () => {
    // Force a throw by making a getter that explodes on access.
    const event: any = {
      event_id: 'abc123',
      transaction: 'GET /verify',
      level: 'warning',
      release: 'v1.9.0',
      environment: 'production',
      platform: 'node',
    };
    Object.defineProperty(event, 'request', {
      get() { throw new Error('boom'); },
      configurable: true,
    });
    const result = scrubSentryEvent(event);
    expect(result).not.toBe(event);
    expect(result?.tags?.scrubber).toBe('failed');
    // Correlation fields preserved so ops can still trace the failure.
    expect(result?.event_id).toBe('abc123');
    expect(result?.transaction).toBe('GET /verify');
    expect(result?.level).toBe('warning');
    expect(result?.release).toBe('v1.9.0');
    expect(result?.environment).toBe('production');
    expect(result?.platform).toBe('node');
  });

  it('falls back to minimal stub if even the enriched stub throws', () => {
    // Pathological event: every property access throws. The outer scrubber
    // catches the first throw, then the inner stub-builder catches the
    // throwing getters that block field access for correlation. Should
    // still return a non-empty stub rather than re-throwing.
    const event: any = new Proxy({}, {
      get() { throw new Error('every-access-throws'); },
    });
    expect(() => scrubSentryEvent(event)).not.toThrow();
    const result = scrubSentryEvent(event);
    expect(result?.tags?.scrubber).toBe('failed');
    expect(result?.message).toContain('scrubber_error');
  });
});
