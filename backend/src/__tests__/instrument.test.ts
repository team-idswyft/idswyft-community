import { describe, it, expect } from 'vitest';
import { redactPII, scrubSentryEvent } from '../instrument.js';

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
});

describe('scrubSentryEvent', () => {
  it('removes request body', () => {
    const event: any = {
      request: {
        data: { first_name: 'Alice', document_number: 'X123' },
      },
    };
    scrubSentryEvent(event);
    expect(event.request.data).toBeUndefined();
  });

  it('strips sensitive headers (lowercase and uppercase)', () => {
    const event: any = {
      request: {
        headers: {
          'x-api-key': 'ik_secret',
          'X-API-KEY': 'ik_secret',
          'authorization': 'Bearer abc',
          'cookie': 'session=xyz',
          'user-agent': 'keep-me',
        },
      },
    };
    scrubSentryEvent(event);
    expect(event.request.headers['x-api-key']).toBeUndefined();
    expect(event.request.headers['X-API-KEY']).toBeUndefined();
    expect(event.request.headers['authorization']).toBeUndefined();
    expect(event.request.headers['cookie']).toBeUndefined();
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
      contexts: {
        user: { email: 'a@b.com', id: 'u123' },
      },
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
    expect(event.breadcrumbs[0].message).toBe('request');
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

  it('returns the event itself (mutation)', () => {
    const event: any = { extra: { name: 'Alice' } };
    const result = scrubSentryEvent(event);
    expect(result).toBe(event);
  });

  it('handles null/undefined event', () => {
    expect(() => scrubSentryEvent(null)).not.toThrow();
    expect(() => scrubSentryEvent(undefined)).not.toThrow();
  });
});
