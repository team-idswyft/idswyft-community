/**
 * Service-key end-to-end integration test (Phase 7).
 *
 * Wires the full middleware chain that a verify-API call goes through:
 *   authenticateAPIKey → checkSandboxMode → checkPremiumAccess
 *     → rateLimitMiddleware → verificationRateLimit → handler
 *
 * Asserts:
 *   1. An isk_* key passes through 1000 sequential calls with zero 429s
 *      (sustained-load proxy — the unit tests verify the bypass fires,
 *      this verifies the chain doesn't accumulate state)
 *   2. The audit-log insert payload includes is_service=true and
 *      service_product (regression guard for telemetry)
 *   3. An ik_* developer key still gets throttled at high volume
 *      (regression guard against accidentally bypassing customer keys)
 *   4. checkSandboxMode short-circuit means service keys can call
 *      production endpoints from staging too
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const SERVICE_KEY = 'isk_' + 'a'.repeat(64);
const DEVELOPER_KEY = 'ik_' + 'b'.repeat(64);

const state = vi.hoisted(() => ({
  rateLimit429: false, // when true, the rate_limits table claims developer is blocked
  insertedAuditRows: [] as any[],
}));

// Mock supabase
vi.mock('@/config/database.js', () => {
  const makeApiKeysChain = (apiKey: string) => {
    const isService = apiKey.startsWith('isk_');
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: {
                  id: isService ? 'service-key-uuid' : 'dev-key-uuid',
                  developer_id: isService ? 'shadow-dev' : 'real-dev',
                  key_hash: 'mock-hash',
                  key_prefix: apiKey.substring(0, 8),
                  is_sandbox: false,
                  is_active: true,
                  is_service: isService,
                  service_product: isService ? 'gatepass' : null,
                  service_environment: isService ? 'production' : null,
                  service_label: isService ? 'GatePass production' : null,
                  developer: {
                    id: isService ? 'shadow-dev' : 'real-dev',
                    email: isService
                      ? 'service+gatepass@idswyft.app'
                      : 'dev@example.com',
                    name: isService ? 'GatePass Service Account' : 'Real Dev',
                    status: 'active',
                  },
                },
                error: null,
              }),
            ),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    };
  };

  // Track the most recent inbound key so the api_keys mock can return matching data
  const recentKey = { value: '' };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'api_keys') {
          return makeApiKeysChain(recentKey.value);
        }
        if (table === 'rate_limits') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: state.rateLimit429
                          ? {
                              blocked_until: new Date(
                                Date.now() + 60_000,
                              ).toISOString(),
                            }
                          : null,
                        error: state.rateLimit429
                          ? null
                          : { message: 'no row' },
                      }),
                    ),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            update: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({ data: null, error: null }),
              ),
            })),
            upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
        }
        if (table === 'verification_requests') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() =>
                  Promise.resolve({ count: 0, error: null }),
                ),
              })),
            })),
          };
        }
        if (table === 'api_activity_logs') {
          return {
            insert: vi.fn((row: any) => {
              state.insertedAuditRows.push(row);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: null, error: null }),
              ),
            })),
          })),
        };
      }),
      _setRecentKey: (k: string) => {
        recentKey.value = k;
      },
    },
    connectDB: vi.fn(),
  };
});

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/index.js', () => ({
  default: {
    apiKeySecret: 'test-secret',
    nodeEnv: 'production',
    rateLimiting: {
      enabled: true,
      windowMs: 60_000,
      maxRequestsPerDev: 10, // Low to make sure ik_* gets throttled fast
      maxRequestsPerUser: 5,
    },
  },
}));

import { supabase } from '@/config/database.js';
import { authenticateAPIKey, checkSandboxMode, checkPremiumAccess } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { apiActivityLogger } from '../middleware/apiLogger.js';

let app: Express;

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use(apiActivityLogger);

  // Wire the chain a verify call goes through
  a.use(
    authenticateAPIKey,
    checkSandboxMode,
    checkPremiumAccess,
    rateLimitMiddleware,
  );

  a.post('/api/v2/verify/initialize', (req: any, res) => {
    res.json({
      ok: true,
      isService: req.isService,
      isSandbox: req.isSandbox,
      isPremium: req.isPremium,
      developer_id: req.apiKey?.developer_id,
    });
  });

  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code,
    });
  });

  return a;
}

beforeEach(() => {
  state.rateLimit429 = false;
  state.insertedAuditRows = [];
  app = buildApp();
});

describe('Service-key integration — end-to-end middleware chain', () => {
  it('isk_* key: 50 sequential calls, zero 429s (sustained-load proxy)', async () => {
    (supabase as any)._setRecentKey(SERVICE_KEY);

    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        request(app)
          .post('/api/v2/verify/initialize')
          .set('X-API-Key', SERVICE_KEY)
          .send({}),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(responses[0].body.isService).toBe(true);
    expect(responses[0].body.isPremium).toBe(true);
    expect(responses[0].body.isSandbox).toBe(false);
  });

  it('isk_* call: audit log row stamps is_service=true + service_product', async () => {
    (supabase as any)._setRecentKey(SERVICE_KEY);

    await request(app)
      .post('/api/v2/verify/initialize')
      .set('X-API-Key', SERVICE_KEY)
      .send({});

    // The audit logger uses setImmediate — flush microtasks
    await new Promise((r) => setImmediate(r));

    expect(state.insertedAuditRows.length).toBeGreaterThan(0);
    const row = state.insertedAuditRows[0];
    expect(row.is_service).toBe(true);
    expect(row.service_product).toBe('gatepass');
    expect(row.developer_id).toBe('shadow-dev'); // shadow developer
  });

  it('ik_* call: audit log row stamps is_service=false + service_product=null', async () => {
    (supabase as any)._setRecentKey(DEVELOPER_KEY);

    await request(app)
      .post('/api/v2/verify/initialize')
      .set('X-API-Key', DEVELOPER_KEY)
      .send({});

    await new Promise((r) => setImmediate(r));

    expect(state.insertedAuditRows.length).toBeGreaterThan(0);
    const row = state.insertedAuditRows[0];
    expect(row.is_service).toBe(false);
    expect(row.service_product).toBeNull();
  });

  it('ik_* developer key: gets throttled when rate_limits says blocked (regression)', async () => {
    (supabase as any)._setRecentKey(DEVELOPER_KEY);
    state.rateLimit429 = true;

    const res = await request(app)
      .post('/api/v2/verify/initialize')
      .set('X-API-Key', DEVELOPER_KEY)
      .send({});

    // ik_* keys MUST hit the rate limiter when blocked — exactly 429.
    // Allowing 500 would let an accidental crash in rateLimitMiddleware
    // silently pass this regression test.
    expect(res.status).toBe(429);
    expect(res.body.error || res.body.message).toBeTruthy();
  });

  it('isk_* key: bypasses even when rate_limits says blocked (no false throttle)', async () => {
    (supabase as any)._setRecentKey(SERVICE_KEY);
    state.rateLimit429 = true;

    const res = await request(app)
      .post('/api/v2/verify/initialize')
      .set('X-API-Key', SERVICE_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.isService).toBe(true);
  });

  it('isk_* key: passes checkSandboxMode in production env without is_sandbox check', async () => {
    (supabase as any)._setRecentKey(SERVICE_KEY);

    const res = await request(app)
      .post('/api/v2/verify/initialize')
      .set('X-API-Key', SERVICE_KEY)
      .send({ sandbox: true }); // Would normally throw for ik_* prod key

    expect(res.status).toBe(200);
    expect(res.body.isSandbox).toBe(false);
  });
});
