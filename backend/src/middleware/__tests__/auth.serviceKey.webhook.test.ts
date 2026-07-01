/**
 * Unit tests for authenticateDeveloperJWTOrServiceKey.
 *
 * This is the flexible auth gate added so a keyless isk_* service key can manage
 * its own webhook over X-API-Key. Behaviour under test:
 *   - X-API-Key resolving to a SERVICE key (is_service) → authenticated, no error
 *   - X-API-Key resolving to a NON-service ik_* key → rejected (AuthorizationError)
 *   - No X-API-Key → delegates to the developer JWT path
 *
 * Mocks Supabase + config so it runs without a DB (same style as
 * auth.serviceKey.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mockState = vi.hoisted(() => ({ apiKeyRow: null as any }));

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: mockState.apiKeyRow,
                error: mockState.apiKeyRow ? null : { message: 'not found' },
              }),
          }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
    connectDB: vi.fn(),
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/index.js', () => ({
  default: { apiKeySecret: 'test-secret-for-hmac', jwtSecret: 'jwt-secret', nodeEnv: 'production' },
}));

import { authenticateDeveloperJWTOrServiceKey } from '../auth.js';

const makeReq = (headers: Record<string, string> = {}): Request =>
  ({
    headers,
    cookies: {},
    body: {},
    query: {},
    ip: '127.0.0.1',
    get: () => 'test',
  }) as unknown as Request;

const makeRes = (): Response => ({} as Response);

const makeNext = (): NextFunction & { called: number; lastError?: any } => {
  const next: any = (err?: any) => {
    next.called += 1;
    next.lastError = err;
  };
  next.called = 0;
  return next;
};

describe('authenticateDeveloperJWTOrServiceKey', () => {
  beforeEach(() => {
    mockState.apiKeyRow = null;
  });

  it('authenticates an isk_* service key via X-API-Key', async () => {
    mockState.apiKeyRow = {
      id: 'svc-key-uuid',
      developer_id: 'shadow-dev',
      key_prefix: 'isk_aaaa',
      is_active: true,
      is_service: true,
      service_product: 'gatepass',
      developer: { id: 'shadow-dev', status: 'active' },
    };

    const req = makeReq({ 'x-api-key': 'isk_value' });
    const next = makeNext();

    await (authenticateDeveloperJWTOrServiceKey as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(req.apiKey?.is_service).toBe(true);
    expect(req.apiKey?.id).toBe('svc-key-uuid');
  });

  it('rejects a non-service ik_* developer key via X-API-Key', async () => {
    mockState.apiKeyRow = {
      id: 'dev-key-uuid',
      developer_id: 'real-dev',
      key_prefix: 'ik_bbbb',
      is_active: true,
      is_service: false,
      developer: { id: 'real-dev', status: 'active' },
    };

    const req = makeReq({ 'x-api-key': 'ik_value' });
    const next = makeNext();

    await (authenticateDeveloperJWTOrServiceKey as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeDefined();
    expect(next.lastError.message).toMatch(/service API key/i);
    expect(next.lastError.statusCode).toBe(403);
  });

  it('delegates to the JWT path when no X-API-Key header is present', async () => {
    // No api-key header and no token → JWT path throws "Access token is required".
    const req = makeReq({});
    const next = makeNext();

    await (authenticateDeveloperJWTOrServiceKey as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeDefined();
    expect(next.lastError.message).toMatch(/access token is required/i);
  });
});
