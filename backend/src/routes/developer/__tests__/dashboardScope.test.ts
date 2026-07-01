/**
 * Dashboard-scope route tests (Tasks 3–5).
 *
 * Covers the scoped GET /profile and GET /api-keys endpoints that use
 * authenticateDashboard + scopeForRequest:
 *
 *   - GET /profile  → operator principal returns `operator` block (no `data`)
 *   - GET /profile  → developer principal returns `data` block
 *   - GET /api-keys → operator principal returns ONLY their own key (isolation)
 *   - GET /api-keys → developer principal returns ALL their active keys
 *
 * Auth is stubbed via `x-test-principal` header (same pattern as
 * webhooks.serviceKey.test.ts). `scopeForRequest` is kept REAL so the
 * api-keys isolation test exercises actual handler behaviour.
 *
 * The supabase mock is a tiny filter-applying query engine seeded per test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import {
  getDailyVerificationVolume,
  getGateRejectionBreakdown,
  getDailyResponseTimes,
  getConversionFunnel,
  getDailyWebhookDeliveries,
} from '@/services/analyticsService.js';

// ─── Principals ──────────────────────────────────────────────────────────────
const SHADOW_DEV = 'shadow-dev-uuid-0001';
const REAL_DEV   = 'real-dev-uuid-0002';
const K1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const K2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

// ─── Shared mutable state (hoisted so vi.mock factories can reference it) ────
const state = vi.hoisted(() => ({
  apiKeyRows: [] as any[],
  verificationRows: [] as any[],
  activityRows: [] as any[],
}));

// ─── Supabase mock: filter-applying engine for all tables ────────────────────
vi.mock('@/config/database.js', () => {
  const applyFilters = (rows: any[], filters: Array<[string, any]>) =>
    rows.filter((r) =>
      filters.every(([col, val]) => {
        if (col.startsWith('__in__')) {
          const actualCol = col.slice(6); // '__in__' is 6 chars
          return Array.isArray(val) && val.includes(r[actualCol]);
        }
        return val === null ? r[col] == null : r[col] === val;
      }),
    );

  // Returns a builder that is thenable (so `await chain` works), supports
  // `.eq()`, `.gte()`, `.order()`, `.limit()`, `.in()`, and `.single()`.
  const makeSelectChain = (rows: any[]) => {
    const filters: Array<[string, any]> = [];
    const chain: any = {
      eq: (col: string, val: any) => {
        filters.push([col, val]);
        return chain;
      },
      gte: (_col: string, _val: any) => chain,
      order: (_col: string, _opts?: any) => chain,
      limit: (_n: number) => chain,
      in: (col: string, vals: any[]) => {
        filters.push([`__in__${col}`, vals] as [string, any]);
        return chain;
      },
      single: () => {
        const matched = applyFilters(rows, filters);
        if (matched.length === 0) {
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }
        return Promise.resolve({ data: matched[0], error: null });
      },
      // Makes `await chain` and `Promise.all([chain, ...])` resolve directly.
      // Also surfaces `count` (matched-row count) so head:true count queries
      // like the /analytics monthly quota resolve with a real number.
      then: (resolve_fn: (v: any) => any, reject_fn?: (e: any) => any) => {
        const matched = applyFilters(rows, filters);
        return Promise.resolve({ data: matched, error: null, count: matched.length }).then(resolve_fn, reject_fn);
      },
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => {
        if (table === 'api_keys') {
          return { select: () => makeSelectChain(state.apiKeyRows) };
        }
        if (table === 'verification_requests') {
          return { select: () => makeSelectChain(state.verificationRows) };
        }
        if (table === 'api_activity_logs') {
          return { select: () => makeSelectChain(state.activityRows) };
        }
        // verification_contexts and any other table: empty rows (single() → null)
        return { select: () => makeSelectChain([]) };
      },
    },
    connectDB: vi.fn(),
  };
});

// ─── Auth stub ───────────────────────────────────────────────────────────────
// Mock `authenticateDashboard` to populate req from x-test-principal header.
// `scopeForRequest` is kept REAL (spread ...actual) — it must read the real
// req properties to produce the correct scope, which is the load-bearing
// invariant being tested.
vi.mock('@/middleware/auth.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const setPrincipal = (req: any, _res: any, next: any) => {
    const who = req.headers['x-test-principal'];
    if (who === 'operator') {
      req.developer    = { id: SHADOW_DEV, email: 'shadow@example.com', name: 'Shadow', company: null, avatar_url: null, created_at: '2026-01-01T00:00:00Z', status: 'active' };
      req.operatorKeyId = K1;
      req.operatorEmail = 'op@example.com';
      req.apiKey        = {
        id: K1,
        is_service: true,
        key_prefix: 'isk_aaaa',
        service_label: 'gateway',
        service_product: 'product-x',
        service_environment: 'production',
      };
    } else if (who === 'developer') {
      req.developer = { id: REAL_DEV, email: 'dev@example.com', name: 'Dev User', company: 'Acme', avatar_url: null, created_at: '2026-02-01T00:00:00Z', status: 'active' };
      req.apiKey    = undefined;
    } else {
      return _res.status(401).json({ error: 'unauthenticated' });
    }
    next();
  };
  return {
    ...actual,
    authenticateDashboard: setPrincipal,
    // keep authenticateDeveloperJWT real for routes that still use it
  };
});

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── analyticsService stub ────────────────────────────────────────────────────
// Replace the 5 aggregation functions with vi.fn()s returning benign empty
// shapes so the /analytics handler runs without touching real aggregation SQL.
// The tests assert the 3rd arg (apiKeyId) each receives. getDefaultPeriod is
// kept as a stub returning a fixed period so the handler has a value to pass.
vi.mock('@/services/analyticsService.js', () => ({
  getDefaultPeriod: vi.fn(() => ({ start_date: '2026-06-24T00:00:00Z', end_date: '2026-07-01T00:00:00Z' })),
  getDailyVerificationVolume: vi.fn(async () => []),
  getGateRejectionBreakdown: vi.fn(async () => []),
  getDailyResponseTimes: vi.fn(async () => []),
  getConversionFunnel: vi.fn(async () => []),
  getDailyWebhookDeliveries: vi.fn(async () => []),
}));

// ─── App factory ─────────────────────────────────────────────────────────────
let app: Express;

async function buildApp() {
  const profileMod   = await import('../profile.js');
  const apiKeysMod   = await import('../apiKeys.js');
  const analyticsMod = await import('../analytics.js');
  const a = express();
  a.use(express.json());
  a.use('/api/developer', profileMod.default);
  a.use('/api/developer', apiKeysMod.default);
  a.use('/api/developer', analyticsMod.default);
  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  });
  return a;
}

beforeEach(async () => {
  state.apiKeyRows = [];
  state.verificationRows = [];
  state.activityRows = [];
  app = await buildApp();
});

// ─── GET /profile ─────────────────────────────────────────────────────────────

describe('GET /api/developer/profile — operator principal', () => {
  it('returns the operator block (no data block)', async () => {
    const res = await request(app)
      .get('/api/developer/profile')
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('service-operator');
    expect(res.body.operator).toBeDefined();
    expect(res.body.data).toBeUndefined();

    expect(res.body.operator.email).toBe('op@example.com');
    expect(res.body.operator.api_key_id).toBe(K1);
    expect(res.body.operator.key_prefix).toBe('isk_aaaa');
    expect(res.body.operator.service_label).toBe('gateway');
    expect(res.body.operator.service_product).toBe('product-x');
    expect(res.body.operator.service_environment).toBe('production');
  });
});

describe('GET /api/developer/profile — developer principal', () => {
  it('returns the data block (no operator block)', async () => {
    const res = await request(app)
      .get('/api/developer/profile')
      .set('x-test-principal', 'developer');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.operator).toBeUndefined();
    expect(res.body.scope).toBeUndefined();

    expect(res.body.data.id).toBe(REAL_DEV);
    expect(res.body.data.email).toBe('dev@example.com');
    expect(res.body.data.name).toBe('Dev User');
    expect(res.body.data.company).toBe('Acme');
  });
});

// ─── GET /api-keys ────────────────────────────────────────────────────────────

describe('GET /api/developer/api-keys — operator principal (key isolation)', () => {
  it('returns ONLY the key whose id == operatorKeyId (not the other key under the same shadow dev)', async () => {
    // Both K1 and K2 share SHADOW_DEV — only developer_id filter is NOT enough
    // to isolate them. The handler must also apply .eq('id', K1).
    state.apiKeyRows = [
      { id: K1, developer_id: SHADOW_DEV, key_prefix: 'isk_aaaa', name: 'Key A', is_sandbox: false, is_active: true, last_used_at: null, created_at: '2026-01-01T00:00:00Z', expires_at: null },
      { id: K2, developer_id: SHADOW_DEV, key_prefix: 'isk_bbbb', name: 'Key B', is_sandbox: false, is_active: true, last_used_at: null, created_at: '2026-01-02T00:00:00Z', expires_at: null },
    ];

    const res = await request(app)
      .get('/api/developer/api-keys')
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);
    expect(res.body.api_keys).toHaveLength(1);
    expect(res.body.api_keys[0].id).toBe(K1);
    // K2 must NOT be present — this is the isolation property
    expect(res.body.api_keys.find((k: any) => k.id === K2)).toBeUndefined();
  });
});

describe('GET /api/developer/api-keys — developer principal (no narrowing)', () => {
  it('returns all active keys for the developer (no api_key_id narrowing)', async () => {
    const D1 = 'cccccccc-3333-4333-8333-cccccccccccc';
    const D2 = 'dddddddd-4444-4444-8444-dddddddddddd';
    state.apiKeyRows = [
      { id: D1, developer_id: REAL_DEV, key_prefix: 'ik_cccc', name: 'Dev Key 1', is_sandbox: true, is_active: true, last_used_at: null, created_at: '2026-02-01T00:00:00Z', expires_at: null },
      { id: D2, developer_id: REAL_DEV, key_prefix: 'ik_dddd', name: 'Dev Key 2', is_sandbox: true, is_active: true, last_used_at: null, created_at: '2026-02-02T00:00:00Z', expires_at: null },
    ];

    const res = await request(app)
      .get('/api/developer/api-keys')
      .set('x-test-principal', 'developer');

    expect(res.status).toBe(200);
    expect(res.body.api_keys).toHaveLength(2);
    expect(res.body.api_keys.map((k: any) => k.id)).toEqual(
      expect.arrayContaining([D1, D2]),
    );
  });
});

// ─── GET /stats ───────────────────────────────────────────────────────────────

describe('GET /api/developer/stats — operator principal (scoped to api_key_id)', () => {
  it('counts only verifications belonging to the operator key (not the other key under same dev)', async () => {
    // 2 verified rows for K1, 1 verified row for K2 — all share SHADOW_DEV.
    // If the api_key_id filter is missing, total_requests would be 3.
    state.verificationRows = [
      { developer_id: SHADOW_DEV, api_key_id: K1, status: 'verified', created_at: '2026-06-01T00:00:00Z' },
      { developer_id: SHADOW_DEV, api_key_id: K1, status: 'verified', created_at: '2026-06-02T00:00:00Z' },
      { developer_id: SHADOW_DEV, api_key_id: K2, status: 'verified', created_at: '2026-06-03T00:00:00Z' },
    ];

    const res = await request(app)
      .get('/api/developer/stats')
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);
    expect(res.body.total_requests).toBe(2);
    expect(res.body.successful_requests).toBe(2);
    // Operators / service keys have no quota → unlimited (null), remaining also null.
    expect(res.body.monthly_limit).toBeNull();
    expect(res.body.remaining_quota).toBeNull();
  });
});

describe('GET /api/developer/stats — developer principal (no api_key_id filter)', () => {
  it('counts ALL verifications for the developer regardless of api_key_id', async () => {
    state.verificationRows = [
      { developer_id: REAL_DEV, api_key_id: K1, status: 'verified', created_at: '2026-06-01T00:00:00Z' },
      { developer_id: REAL_DEV, api_key_id: null, status: 'failed',  created_at: '2026-06-02T00:00:00Z' },
      { developer_id: REAL_DEV, api_key_id: K2,   status: 'pending', created_at: '2026-06-03T00:00:00Z' },
    ];

    const res = await request(app)
      .get('/api/developer/stats')
      .set('x-test-principal', 'developer');

    expect(res.status).toBe(200);
    expect(res.body.total_requests).toBe(3);
    // Developers keep the 50/mo quota (unchanged behaviour).
    expect(res.body.monthly_limit).toBe(50);
  });
});

// ─── GET /activity ────────────────────────────────────────────────────────────

describe('GET /api/developer/activity — operator principal (both queries scoped; ?api_key_id ignored)', () => {
  it('scopes recent_activities and statistics to operator key; ignores ?api_key_id=K2', async () => {
    // Activity rows: 2 for K1, 1 for K2, all under SHADOW_DEV.
    // No UUID-shaped endpoints so sessionIds stays empty (no session-outcomes query).
    state.activityRows = [
      { developer_id: SHADOW_DEV, api_key_id: K1, timestamp: '2026-06-01T01:00:00Z', method: 'POST', endpoint: '/api/v2/verify/initialize', status_code: 200, response_time_ms: 50, user_agent: null, ip_address: null, error_message: null },
      { developer_id: SHADOW_DEV, api_key_id: K1, timestamp: '2026-06-01T02:00:00Z', method: 'GET',  endpoint: '/api/v2/verify/status',     status_code: 200, response_time_ms: 30, user_agent: null, ip_address: null, error_message: null },
      { developer_id: SHADOW_DEV, api_key_id: K2, timestamp: '2026-06-01T03:00:00Z', method: 'POST', endpoint: '/api/v2/verify/initialize', status_code: 200, response_time_ms: 45, user_agent: null, ip_address: null, error_message: null },
    ];
    // Verification stats: 2 for K1, 1 for K2.
    state.verificationRows = [
      { developer_id: SHADOW_DEV, api_key_id: K1, status: 'verified' },
      { developer_id: SHADOW_DEV, api_key_id: K1, status: 'failed' },
      { developer_id: SHADOW_DEV, api_key_id: K2, status: 'verified' },
    ];

    // Pass ?api_key_id=K2 — operator must ignore it and use K1 (their own key).
    const res = await request(app)
      .get(`/api/developer/activity?api_key_id=${K2}`)
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);
    // Only K1's 2 activity rows returned
    expect(res.body.recent_activities).toHaveLength(2);
    expect(res.body.recent_activities.every((a: any) => a.api_key_id === K1)).toBe(true);
    // Statistics also scoped to K1 (2 rows)
    expect(res.body.statistics.total_requests).toBe(2);
  });
});

describe('GET /api/developer/activity — developer principal (no api_key_id filter)', () => {
  it('returns all activities and stats for the developer without narrowing', async () => {
    state.activityRows = [
      { developer_id: REAL_DEV, api_key_id: K1,   timestamp: '2026-06-01T01:00:00Z', method: 'POST', endpoint: '/api/v2/verify/initialize', status_code: 200, response_time_ms: 50, user_agent: null, ip_address: null, error_message: null },
      { developer_id: REAL_DEV, api_key_id: null,  timestamp: '2026-06-01T02:00:00Z', method: 'GET',  endpoint: '/api/v2/verify/status',     status_code: 200, response_time_ms: 30, user_agent: null, ip_address: null, error_message: null },
    ];
    state.verificationRows = [
      { developer_id: REAL_DEV, api_key_id: K1,  status: 'verified' },
      { developer_id: REAL_DEV, api_key_id: null, status: 'pending'  },
    ];

    const res = await request(app)
      .get('/api/developer/activity')
      .set('x-test-principal', 'developer');

    expect(res.status).toBe(200);
    expect(res.body.recent_activities).toHaveLength(2);
    expect(res.body.statistics.total_requests).toBe(2);
  });
});

describe('GET /api/developer/activity — operator session-outcomes api_key_id scoping (query 3)', () => {
  // The /activity handler derives session UUIDs from activity-log endpoint paths,
  // then fetches verification outcomes with:
  //   .in('id', sessionIds).eq('api_key_id', effectiveKeyId)
  //
  // To confirm the api_key_id guard is load-bearing (not just the .in() filter),
  // K2's UUID must enter sessionIds.  We seed two activity-log rows, both under
  // K1, whose endpoint paths contain two distinct session UUIDs — one belonging
  // to K1's verification and one to K2's.  The .eq('api_key_id', K1) guard on
  // query (3) is then the ONLY thing that prevents K2's outcome from leaking.
  // (If that guard were absent, session_outcomes[S_K2] would flip to 'failed'.)
  //
  // Note: the task spec suggests a single activity row + K2-different-id, which
  // cannot lock this guard once .in() is fixed (K2 would already be excluded by
  // .in() before reaching api_key_id).  Two activity rows is the minimal seeding
  // that forces the api_key_id guard to be the discriminating exclusion.
  const S_K1 = '11111111-aaaa-4aaa-8aaa-111111111111';
  const S_K2 = '22222222-bbbb-4bbb-8bbb-222222222222';

  it('excludes K2 session outcome even when K2 UUID appears in scoped activity endpoints', async () => {
    state.activityRows = [
      // K1 operator called its own session:
      {
        developer_id: SHADOW_DEV, api_key_id: K1,
        timestamp: '2026-06-01T01:00:00Z', method: 'GET',
        endpoint: `/api/v2/verify/${S_K1}/status`,
        status_code: 200, response_time_ms: 30,
        user_agent: null, ip_address: null, error_message: null,
      },
      // K1 operator also queried a session whose UUID belongs to K2's verification.
      // This row is load-bearing: it puts S_K2 into sessionIds so the api_key_id
      // guard is what excludes the K2 row (not the .in() filter).
      {
        developer_id: SHADOW_DEV, api_key_id: K1,
        timestamp: '2026-06-01T01:01:00Z', method: 'GET',
        endpoint: `/api/v2/verify/${S_K2}/status`,
        status_code: 200, response_time_ms: 25,
        user_agent: null, ip_address: null, error_message: null,
      },
    ];
    state.verificationRows = [
      { id: S_K1, developer_id: SHADOW_DEV, api_key_id: K1, status: 'verified' },
      // K2's verification: id is in sessionIds (via the second activity row above),
      // but api_key_id=K2 so the .eq('api_key_id', K1) guard must exclude it.
      { id: S_K2, developer_id: SHADOW_DEV, api_key_id: K2, status: 'failed' },
    ];

    const res = await request(app)
      .get('/api/developer/activity')
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);

    // K1's own session outcome is present
    expect(res.body.session_outcomes[S_K1]).toBe('verified');

    // K2's session outcome must be absent — blocked by .eq('api_key_id', K1)
    // on the session-outcomes query.  If that guard were removed, S_K2 would
    // appear with status 'failed' because its id IS in sessionIds.
    expect(res.body.session_outcomes[S_K2]).toBeUndefined();
  });
});

// ─── GET /verifications/:id ───────────────────────────────────────────────────

// Valid UUIDs required — param validator rejects non-UUIDs with 400.
const V_K1 = '11111111-aaaa-4aaa-8aaa-111111111111'; // belongs to K1
const V_K2 = '22222222-bbbb-4bbb-8bbb-222222222222'; // belongs to K2

describe('GET /api/developer/verifications/:id — operator cross-key (404)', () => {
  it('returns 404 when the verification belongs to a different key', async () => {
    state.verificationRows = [
      { id: V_K2, developer_id: SHADOW_DEV, api_key_id: K2, status: 'verified', verification_mode: 'full', is_sandbox: false, duplicate_flags: null, manual_review_reason: null },
    ];

    const res = await request(app)
      .get(`/api/developer/verifications/${V_K2}`)
      .set('x-test-principal', 'operator'); // authenticated as K1

    expect(res.status).toBe(404);
  });
});

describe('GET /api/developer/verifications/:id — operator own key (200)', () => {
  it('returns 200 and pending status when the verification belongs to the operator key', async () => {
    state.verificationRows = [
      { id: V_K1, developer_id: SHADOW_DEV, api_key_id: K1, status: 'pending', verification_mode: 'full', is_sandbox: false, duplicate_flags: null, manual_review_reason: null },
    ];
    // verification_contexts returns empty (via mock fallback) → loadSessionState returns null
    // → handler early-returns { status: 'pending' }

    const res = await request(app)
      .get(`/api/developer/verifications/${V_K1}`)
      .set('x-test-principal', 'operator'); // authenticated as K1

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.verification_id).toBe(V_K1);
  });
});

// ─── GET /analytics ───────────────────────────────────────────────────────────

describe('GET /api/developer/analytics — operator principal (scoped to api_key_id)', () => {
  it('passes the operator key (K1) as the 3rd arg to every aggregation and scopes the quota count', async () => {
    // 2 verified rows for K1, 1 for K2 — all share SHADOW_DEV. The quota count
    // must apply .eq('api_key_id', K1) so used === 2, not 3.
    state.verificationRows = [
      { developer_id: SHADOW_DEV, api_key_id: K1, status: 'verified', created_at: '2026-07-01T00:00:00Z' },
      { developer_id: SHADOW_DEV, api_key_id: K1, status: 'verified', created_at: '2026-07-01T00:00:00Z' },
      { developer_id: SHADOW_DEV, api_key_id: K2, status: 'verified', created_at: '2026-07-01T00:00:00Z' },
    ];

    const res = await request(app)
      .get('/api/developer/analytics')
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);

    // Every aggregation function received K1 as its 3rd (apiKeyId) argument,
    // and SHADOW_DEV as its 2nd (developerId) argument.
    expect(getDailyVerificationVolume).toHaveBeenCalledWith(expect.anything(), SHADOW_DEV, K1);
    expect(getGateRejectionBreakdown).toHaveBeenCalledWith(expect.anything(), SHADOW_DEV, K1);
    expect(getDailyResponseTimes).toHaveBeenCalledWith(expect.anything(), SHADOW_DEV, K1);
    expect(getConversionFunnel).toHaveBeenCalledWith(expect.anything(), SHADOW_DEV, K1);
    expect(getDailyWebhookDeliveries).toHaveBeenCalledWith(expect.anything(), SHADOW_DEV, K1);

    // Quota count scoped to K1 → only the 2 K1 rows are counted (K2 excluded).
    expect(res.body.quota.used).toBe(2);
    // Operators / service keys have NO quota — limit is null (unlimited), not 50.
    expect(res.body.quota.limit).toBeNull();
  });
});

describe('GET /api/developer/analytics — developer principal (no api_key_id narrowing)', () => {
  it('passes null as the 3rd arg to every aggregation and counts ALL developer verifications', async () => {
    // 3 rows for REAL_DEV across different keys — none must be narrowed out.
    state.verificationRows = [
      { developer_id: REAL_DEV, api_key_id: K1,   status: 'verified', created_at: '2026-07-01T00:00:00Z' },
      { developer_id: REAL_DEV, api_key_id: null, status: 'failed',   created_at: '2026-07-01T00:00:00Z' },
      { developer_id: REAL_DEV, api_key_id: K2,   status: 'pending',  created_at: '2026-07-01T00:00:00Z' },
    ];

    const res = await request(app)
      .get('/api/developer/analytics')
      .set('x-test-principal', 'developer');

    expect(res.status).toBe(200);

    // Developer path: apiKeyId is null → aggregations receive null as 3rd arg,
    // proving developer behaviour is unchanged.
    expect(getDailyVerificationVolume).toHaveBeenCalledWith(expect.anything(), REAL_DEV, null);
    expect(getGateRejectionBreakdown).toHaveBeenCalledWith(expect.anything(), REAL_DEV, null);
    expect(getDailyResponseTimes).toHaveBeenCalledWith(expect.anything(), REAL_DEV, null);
    expect(getConversionFunnel).toHaveBeenCalledWith(expect.anything(), REAL_DEV, null);
    expect(getDailyWebhookDeliveries).toHaveBeenCalledWith(expect.anything(), REAL_DEV, null);

    // No api_key_id filter on the count → all 3 REAL_DEV rows counted.
    expect(res.body.quota.used).toBe(3);
    // Developers keep the 50/mo quota (unchanged behaviour).
    expect(res.body.quota.limit).toBe(50);
  });
});
