/**
 * Unit tests for the service-operator token primitives + middleware (Phase 2).
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
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: mockState.apiKeyRow,
                  error: mockState.apiKeyRow ? null : { message: 'not found' },
                }),
            }),
          }),
        }),
      }),
    }),
    connectDB: vi.fn(),
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/index.js', () => ({
  default: { jwtSecret: 'test-jwt-secret', apiKeySecret: 'test-secret', nodeEnv: 'test' },
}));

import {
  generateServiceOperatorToken,
  generateServiceOperatorSelectionToken,
  verifyServiceOperatorSelectionToken,
  authenticateServiceOperatorJWT,
} from '../auth.js';

const makeRes = (): Response => ({} as Response);
const makeNext = (): NextFunction & { called: number; lastError?: any } => {
  const next: any = (err?: any) => { next.called += 1; next.lastError = err; };
  next.called = 0;
  return next;
};
const makeReq = (token?: string): Request =>
  ({ headers: token ? { authorization: `Bearer ${token}` } : {}, cookies: {} }) as unknown as Request;

const SHADOW = { id: 'shadow-dev', status: 'active' };
const goodKeyRow = {
  id: 'key-uuid', is_active: true, is_service: true,
  operator_email: 'obed@idswyft.app', service_product: 'gatepass',
  service_environment: 'production', developer: SHADOW,
};

describe('service-operator token + middleware', () => {
  beforeEach(() => { mockState.apiKeyRow = null; });

  it('authenticates a valid operator token and scopes to the key', async () => {
    mockState.apiKeyRow = goodKeyRow;
    const token = generateServiceOperatorToken({
      apiKeyId: 'key-uuid', email: 'obed@idswyft.app', developerId: 'shadow-dev',
      serviceProduct: 'gatepass', serviceEnvironment: 'production',
    });
    const req = makeReq(token);
    const next = makeNext();

    await (authenticateServiceOperatorJWT as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(req.operatorKeyId).toBe('key-uuid');
    expect(req.operatorEmail).toBe('obed@idswyft.app');
    expect(req.developer?.id).toBe('shadow-dev');
    expect(req.apiKey?.id).toBe('key-uuid');
  });

  it('rejects when the key is no longer active (reload returns nothing)', async () => {
    mockState.apiKeyRow = null; // simulates is_active=false filtered out
    const token = generateServiceOperatorToken({
      apiKeyId: 'key-uuid', email: 'obed@idswyft.app', developerId: 'shadow-dev',
    });
    const req = makeReq(token);
    const next = makeNext();
    await (authenticateServiceOperatorJWT as any)(req, makeRes(), next);
    expect(next.lastError).toBeDefined();
    expect(next.lastError.message).toMatch(/no longer active|invalid/i);
  });

  it('rejects when operator_email no longer matches the token (re-bound)', async () => {
    mockState.apiKeyRow = { ...goodKeyRow, operator_email: 'someone-else@idswyft.app' };
    const token = generateServiceOperatorToken({
      apiKeyId: 'key-uuid', email: 'obed@idswyft.app', developerId: 'shadow-dev',
    });
    const req = makeReq(token);
    const next = makeNext();
    await (authenticateServiceOperatorJWT as any)(req, makeRes(), next);
    expect(next.lastError).toBeDefined();
    expect(next.lastError.message).toMatch(/no longer bound/i);
  });

  it('rejects a developer/admin token (wrong audience)', async () => {
    mockState.apiKeyRow = goodKeyRow;
    const req = makeReq('not-a-service-operator-token');
    const next = makeNext();
    await (authenticateServiceOperatorJWT as any)(req, makeRes(), next);
    expect(next.lastError).toBeDefined();
    expect(next.lastError.message).toMatch(/invalid token/i);
  });

  it('round-trips the selection token email and rejects a tampered one', () => {
    const tok = generateServiceOperatorSelectionToken('obed@idswyft.app');
    expect(verifyServiceOperatorSelectionToken(tok)).toBe('obed@idswyft.app');
    expect(() => verifyServiceOperatorSelectionToken('garbage')).toThrow();
  });
});
