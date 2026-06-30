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

// ─── Principals ──────────────────────────────────────────────────────────────
const SHADOW_DEV = 'shadow-dev-uuid-0001';
const REAL_DEV   = 'real-dev-uuid-0002';
const K1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const K2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

// ─── Shared mutable state (hoisted so vi.mock factories can reference it) ────
const state = vi.hoisted(() => ({
  apiKeyRows: [] as any[],
}));

// ─── Supabase mock: filter-applying engine for `api_keys` ────────────────────
vi.mock('@/config/database.js', () => {
  const applyFilters = (rows: any[], filters: Array<[string, any]>) =>
    rows.filter((r) =>
      filters.every(([col, val]) => (val === null ? r[col] == null : r[col] === val)),
    );

  const makeSelectChain = (rows: any[]) => {
    const filters: Array<[string, any]> = [];
    const chain: any = {
      eq: (col: string, val: any) => {
        filters.push([col, val]);
        return chain;
      },
      order: () => Promise.resolve({ data: applyFilters(rows, filters), error: null }),
      single: () => {
        const matched = applyFilters(rows, filters);
        if (matched.length === 0) {
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }
        return Promise.resolve({ data: matched[0], error: null });
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
        // No other table is touched by the routes under test.
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        };
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

// ─── App factory ─────────────────────────────────────────────────────────────
let app: Express;

async function buildApp() {
  const profileMod  = await import('../profile.js');
  const apiKeysMod  = await import('../apiKeys.js');
  const a = express();
  a.use(express.json());
  a.use('/api/developer', profileMod.default);
  a.use('/api/developer', apiKeysMod.default);
  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  });
  return a;
}

beforeEach(async () => {
  state.apiKeyRows = [];
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
