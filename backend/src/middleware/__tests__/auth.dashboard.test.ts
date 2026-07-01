/**
 * Unit tests for authenticateDashboard + scopeForRequest (Phase 3b).
 * authenticateDashboard accepts developer JWT · service-operator cookie · service key,
 * routing a cookie/bearer to the right verifier by its (unverified) audience.
 * Mocks Supabase + config so it runs without a DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const mockState = vi.hoisted(() => ({ apiKeyRow: null as any, developerRow: null as any }));

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: mockState.apiKeyRow, error: mockState.apiKeyRow ? null : { message: 'nf' } }) }),
            single: () => Promise.resolve({ data: table === 'developers' ? mockState.developerRow : mockState.apiKeyRow, error: null }),
          }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
    connectDB: vi.fn(),
  },
  connectDB: vi.fn(),
}));
vi.mock('@/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/config/index.js', () => ({ default: { jwtSecret: 'test-jwt-secret', apiKeySecret: 'test-secret', nodeEnv: 'test' } }));

import { authenticateDashboard, scopeForRequest, generateServiceOperatorToken, generateDeveloperToken } from '../auth.js';

const makeRes = (): Response => ({} as Response);
const makeNext = (): NextFunction & { called: number; lastError?: any } => {
  const next: any = (err?: any) => { next.called += 1; next.lastError = err; };
  next.called = 0;
  return next;
};

describe('authenticateDashboard', () => {
  beforeEach(() => { mockState.apiKeyRow = null; mockState.developerRow = null; });

  it('routes an operator cookie to the operator verifier and scopes by api_key_id', async () => {
    mockState.apiKeyRow = { id: 'key-1', is_active: true, is_service: true, operator_email: 'o@x.io', service_product: 'gatepass', developer: { id: 'shadow', status: 'active' } };
    const token = generateServiceOperatorToken({ apiKeyId: 'key-1', email: 'o@x.io', developerId: 'shadow' });
    const req = { headers: {}, cookies: { idswyft_token: token } } as unknown as Request;
    const next = makeNext();
    await (authenticateDashboard as any)(req, makeRes(), next);
    expect(next.lastError).toBeUndefined();
    expect(req.operatorKeyId).toBe('key-1');
    expect(scopeForRequest(req)).toEqual({ developerId: 'shadow', apiKeyId: 'key-1' });
  });

  it('routes a developer cookie to the developer verifier with null api_key scope', async () => {
    mockState.developerRow = { id: 'dev-1', email: 'd@x.io', status: 'active', is_verified: true };
    const token = generateDeveloperToken({ id: 'dev-1', email: 'd@x.io' } as any);
    const req = { headers: {}, cookies: { idswyft_token: token } } as unknown as Request;
    const next = makeNext();
    await (authenticateDashboard as any)(req, makeRes(), next);
    expect(next.lastError).toBeUndefined();
    expect(req.developer?.id).toBe('dev-1');
    expect(req.operatorKeyId).toBeUndefined();
    expect(scopeForRequest(req)).toEqual({ developerId: 'dev-1', apiKeyId: null });
  });

  it('rejects when no token and no api key', async () => {
    const req = { headers: {}, cookies: {} } as unknown as Request;
    const next = makeNext();
    await (authenticateDashboard as any)(req, makeRes(), next);
    expect(next.lastError).toBeDefined();
    expect(next.lastError.message).toMatch(/access token is required/i);
  });

  it('scopeForRequest returns the service key id for a service-key principal', () => {
    const req = { developer: { id: 'shadow' }, apiKey: { id: 'svc-key', is_service: true } } as unknown as Request;
    expect(scopeForRequest(req)).toEqual({ developerId: 'shadow', apiKeyId: 'svc-key' });
  });
});
