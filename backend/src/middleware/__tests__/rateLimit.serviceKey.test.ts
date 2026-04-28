/**
 * Service-key rate-limit bypass tests.
 *
 * Covers the Phase 3 short-circuits in rateLimit.ts:
 *   - rateLimitMiddleware: bypasses the rate_limits DB lookup + counter increment
 *   - verificationRateLimit: bypasses the 24h verification_requests count
 *
 * Critical assertion: when bypass fires, supabase.from() is never called for
 * those tables. If we accidentally regress and start counting service-key
 * calls, GatePass at venue throughput would burn the cap in seconds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const supabaseFrom = vi.fn();

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: (table: string) => {
      supabaseFrom(table);
      // Return a stub chain that should never be reached for service keys
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    },
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/index.js', () => ({
  default: {
    rateLimiting: {
      enabled: true,
      windowMs: 60_000,
      maxRequestsPerDev: 100,
      maxRequestsPerUser: 50,
    },
  },
}));

import {
  rateLimitMiddleware,
  verificationRateLimit,
} from '../rateLimit.js';

const makeReq = (apiKey: any): Request =>
  ({
    apiKey,
    headers: {},
    body: {},
    query: {},
    ip: '127.0.0.1',
    get: () => undefined,
  }) as unknown as Request;

const makeRes = (): Response =>
  ({
    set: vi.fn(),
  }) as unknown as Response;

const makeNext = (): NextFunction & { called: number; lastError?: any } => {
  const next: any = (err?: any) => {
    next.called += 1;
    next.lastError = err;
  };
  next.called = 0;
  return next;
};

describe('rateLimitMiddleware — service-key bypass (Phase 3)', () => {
  beforeEach(() => {
    supabaseFrom.mockClear();
  });

  it('bypasses for isk_* keys without touching the rate_limits table', async () => {
    const req = makeReq({
      developer_id: 'shadow-dev',
      is_service: true,
      service_product: 'gatepass',
    });
    const next = makeNext();

    await (rateLimitMiddleware as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('still hits the rate_limits table for ik_* developer keys (regression)', async () => {
    const req = makeReq({
      developer_id: 'real-dev',
      is_service: false,
    });
    const next = makeNext();

    await (rateLimitMiddleware as any)(req, makeRes(), next);

    // The DB chain returns null/no-error → middleware proceeds, but it MUST
    // have queried supabase to check the limit. This is the regression guard.
    expect(supabaseFrom).toHaveBeenCalledWith('rate_limits');
  });
});

describe('verificationRateLimit — service-key bypass (Phase 3)', () => {
  beforeEach(() => {
    supabaseFrom.mockClear();
  });

  it('bypasses for isk_* keys without counting verification_requests', async () => {
    const req = makeReq({
      developer_id: 'shadow-dev',
      is_service: true,
      service_product: 'gatepass',
    });
    const next = makeNext();

    await (verificationRateLimit as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('still counts verification_requests for ik_* developer keys (regression)', async () => {
    const req = makeReq({
      developer_id: 'real-dev',
      is_service: false,
    });
    const next = makeNext();

    await (verificationRateLimit as any)(req, makeRes(), next);

    expect(supabaseFrom).toHaveBeenCalledWith('verification_requests');
  });
});
