/**
 * Unit tests for authenticateReviewPrincipal (Phase 4, Task 1).
 *
 * ESM live-binding note: vi.spyOn on exported delegates from the same module
 * cannot intercept the internal closure references that authenticateReviewPrincipal
 * uses. Routing is therefore verified via each delegate's distinct observable
 * error, not via spy call-count. Same pattern as auth.serviceOperator.test.ts.
 *
 *   idswyft-service-operator audience → authenticateServiceOperatorJWT
 *     • signs with correct secret, sets type:'x' (not 'service-operator')
 *     • jwt.verify succeeds, type-check fails → "Invalid service operator token"
 *
 *   any other audience (e.g. idswyft-admin) → authenticateAdminOrReviewer
 *     • supabase: {} makes both DB lookups throw (caught silently)
 *     • falls through to → "Invalid or expired token"
 *
 *   no token → authenticateAdminOrReviewer → "Access token is required"
 */
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Declared via vi.hoisted so the mock factory can reference it safely
// (vi.mock calls are hoisted to the top of the file before const declarations).
const { SECRET } = vi.hoisted(() => ({ SECRET: 'test-jwt-secret' }));

vi.mock('@/config/database.js', () => ({ supabase: {}, connectDB: vi.fn() }));
vi.mock('@/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/config/index.js', () => ({
  default: { jwtSecret: 'test-jwt-secret', apiKeySecret: 'test-secret', nodeEnv: 'test' },
}));

import { authenticateReviewPrincipal } from '../auth.js';

function tokenWithAud(aud: string, type = 'x') {
  return jwt.sign({ type }, SECRET, { issuer: 'idswyft-api', audience: aud });
}

const makeNext = (): any => {
  const next: any = (err?: any) => { next.called += 1; next.lastError = err; };
  next.called = 0;
  return next;
};

describe('authenticateReviewPrincipal — audience routing', () => {
  it('routes an idswyft-service-operator token to the operator middleware', async () => {
    // type:'x' makes authenticateServiceOperatorJWT fail with its specific error
    // (jwt.verify succeeds with correct secret; type check fails)
    const req: any = {
      headers: { authorization: `Bearer ${tokenWithAud('idswyft-service-operator')}` },
      cookies: {},
    };
    const next = makeNext();
    await (authenticateReviewPrincipal as any)(req, {} as any, next);
    expect(next.lastError?.message).toMatch(/invalid service operator token/i);
  });

  it('routes an admin/reviewer token to authenticateAdminOrReviewer', async () => {
    // supabase:{} makes both admin + reviewer DB lookups throw (caught silently)
    // → "Invalid or expired token" is the terminal error from authenticateAdminOrReviewer
    const req: any = {
      headers: { authorization: `Bearer ${tokenWithAud('idswyft-admin')}` },
      cookies: {},
    };
    const next = makeNext();
    await (authenticateReviewPrincipal as any)(req, {} as any, next);
    expect(next.lastError?.message).toMatch(/invalid or expired token/i);
  });

  it('routes a request with no token to authenticateAdminOrReviewer (which rejects it)', async () => {
    const req: any = { headers: {}, cookies: {} };
    const next = makeNext();
    await (authenticateReviewPrincipal as any)(req, {} as any, next);
    expect(next.lastError?.message).toMatch(/access token is required/i);
  });
});
