/**
 * Service-key webhook self-management tests (developer/webhooks.ts).
 *
 * Covers the feature that lets a keyless isk_* service key manage its OWN
 * webhook over X-API-Key (no developer-portal JWT):
 *   - POST   /webhooks               create + return one-time signing secret
 *   - GET    /webhooks               list (only the calling key's own webhooks)
 *   - GET    /webhooks/:id/secret    reveal the signing secret
 *   - DELETE /webhooks/:id           delete
 *
 * The security-critical property under test is PER-KEY ISOLATION. All service
 * keys for a product share one shadow developer row, so developer_id is NOT a
 * tenant boundary — api_key_id is. The supabase mock is a tiny query engine: it
 * applies the recorded .eq()/.is() filters against a seeded dataset, so the
 * tests exercise isolation through real handler behaviour rather than asserting
 * on query internals.
 *
 * Auth itself (the JWT-or-service-key middleware, is_service gating) is unit
 * tested in middleware/__tests__/auth.serviceKey.webhook.test.ts; here the auth
 * middleware is stubbed so we can drive each principal precisely.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const SHADOW_DEV = 'shadow-gatepass-uuid';
const REAL_DEV = 'real-dev-uuid';
const K1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const K2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

const state = vi.hoisted(() => ({
  // Seeded webhook rows; the mock applies recorded filters against this.
  webhookRows: [] as any[],
  // Captured inserts (the POST handler's row), for hard-set assertions.
  inserted: [] as any[],
}));

// --- supabase mock: a minimal filter-applying query engine for `webhooks` ----
vi.mock('@/config/database.js', () => {
  // Apply equality filters ([col, val]); val === null means IS NULL.
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
      is: (col: string, val: any) => {
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

  const makeDeleteChain = (rows: any[]) => {
    const filters: Array<[string, any]> = [];
    const exec = () => {
      const remaining = rows.filter(
        (r) => !filters.every(([col, val]) => (val === null ? r[col] == null : r[col] === val)),
      );
      state.webhookRows = remaining;
      return { data: null, error: null };
    };
    const chain: any = {
      eq: (col: string, val: any) => {
        filters.push([col, val]);
        return chain;
      },
      then: (resolve: any) => Promise.resolve(exec()).then(resolve),
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => {
        if (table !== 'webhooks') {
          // No other table is touched on the service-key path under test.
          return {
            select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          };
        }
        return {
          select: () => makeSelectChain(state.webhookRows),
          insert: (row: any) => {
            state.inserted.push(row);
            const created = { ...row, id: 'created-webhook-uuid', is_active: true, created_at: '2026-06-29T00:00:00Z' };
            state.webhookRows.push(created);
            return { select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }) };
          },
          delete: () => makeDeleteChain(state.webhookRows),
        };
      },
    },
    connectDB: vi.fn(),
  };
});

// --- stub the auth middleware so we can drive each principal via a header ----
vi.mock('@/middleware/auth.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const setPrincipal = (req: any, res: any, next: any) => {
    const who = req.headers['x-test-principal'];
    if (who === 'k1') {
      req.developer = { id: SHADOW_DEV, status: 'active' };
      req.apiKey = { id: K1, is_service: true };
    } else if (who === 'k2') {
      req.developer = { id: SHADOW_DEV, status: 'active' };
      req.apiKey = { id: K2, is_service: true };
    } else if (who === 'jwt') {
      req.developer = { id: REAL_DEV, status: 'active' };
      req.apiKey = undefined;
    } else {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    next();
  };
  return {
    ...actual,
    authenticateDeveloperJWTOrServiceKey: setPrincipal,
    authenticateDeveloperJWT: setPrincipal,
  };
});

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/validateUrl.js', () => ({
  validateWebhookUrl: vi.fn(async (url: string) => {
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('169.254')) {
      throw new Error('SSRF protection: private/reserved network URL not allowed');
    }
  }),
  getSafeHttpAgent: () => undefined,
  getSafeHttpsAgent: () => undefined,
  SsrfError: class SsrfError extends Error {},
}));

let app: Express;

async function buildApp() {
  const mod = await import('../webhooks.js');
  const a = express();
  a.use(express.json());
  a.use('/api/developer', mod.default);
  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  });
  return a;
}

beforeEach(async () => {
  state.webhookRows = [];
  state.inserted = [];
  app = await buildApp();
});

const WEBHOOK_URL = 'https://sezyeekgvzjqlwqspcdx.supabase.co/functions/v1/idswyft-webhook';

describe('POST /api/developer/webhooks — service key create', () => {
  it('hard-sets api_key_id to the calling key and forces production (ignores body)', async () => {
    const res = await request(app)
      .post('/api/developer/webhooks')
      .set('x-test-principal', 'k1')
      .send({
        url: WEBHOOK_URL,
        events: ['verification.completed', 'verification.failed', 'verification.manual_review'],
        // Hostile inputs that MUST be ignored for a service key:
        api_key_id: K2,
        is_sandbox: true,
      });

    expect(res.status).toBe(201);
    // One-time plaintext secret returned
    expect(res.body.webhook.secret_key).toMatch(/^whsec_[0-9a-f]{48}$/);

    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0];
    expect(row.api_key_id).toBe(K1); // NOT K2 — exfiltration hole closed
    expect(row.is_sandbox).toBe(false); // service keys force production
    expect(row.developer_id).toBe(SHADOW_DEV);
    expect(row.events).toEqual([
      'verification.completed',
      'verification.failed',
      'verification.manual_review',
    ]);
  });

  it('rejects a private/SSRF URL (400)', async () => {
    const res = await request(app)
      .post('/api/developer/webhooks')
      .set('x-test-principal', 'k1')
      .send({ url: 'https://127.0.0.1/hook' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/developer/webhooks — service key list isolation', () => {
  it('returns only the calling key\'s own webhooks', async () => {
    state.webhookRows = [
      { id: 'wh-k1', developer_id: SHADOW_DEV, api_key_id: K1, url: 'https://k1.example.com/h', is_sandbox: false, is_active: true, events: [], secret_key: 'whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', created_at: 'x' },
      { id: 'wh-k2', developer_id: SHADOW_DEV, api_key_id: K2, url: 'https://k2.example.com/h', is_sandbox: false, is_active: true, events: [], secret_key: 'whsec_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', created_at: 'x' },
    ];

    const res = await request(app).get('/api/developer/webhooks').set('x-test-principal', 'k1');

    expect(res.status).toBe(200);
    expect(res.body.webhooks).toHaveLength(1);
    expect(res.body.webhooks[0].id).toBe('wh-k1');
    // Secret is masked in the list response
    expect(res.body.webhooks[0].secret_key).toMatch(/\*{8}/);
  });
});

describe('GET /api/developer/webhooks/:id/secret — service key isolation', () => {
  beforeEach(() => {
    state.webhookRows = [
      { id: '11111111-1111-4111-8111-111111111111', developer_id: SHADOW_DEV, api_key_id: K1, secret_key: 'whsec_k1secret' },
      { id: '22222222-2222-4222-8222-222222222222', developer_id: SHADOW_DEV, api_key_id: K2, secret_key: 'whsec_k2secret' },
    ];
  });

  it('reveals the secret of the key\'s own webhook', async () => {
    const res = await request(app)
      .get('/api/developer/webhooks/11111111-1111-4111-8111-111111111111/secret')
      .set('x-test-principal', 'k1');
    expect(res.status).toBe(200);
    expect(res.body.secret_key).toBe('whsec_k1secret');
  });

  it('returns 404 when a key tries to read ANOTHER key\'s webhook secret', async () => {
    const res = await request(app)
      .get('/api/developer/webhooks/22222222-2222-4222-8222-222222222222/secret') // K2's webhook
      .set('x-test-principal', 'k1'); // authenticated as K1
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/developer/webhooks/:id — service key isolation', () => {
  beforeEach(() => {
    state.webhookRows = [
      { id: '11111111-1111-4111-8111-111111111111', developer_id: SHADOW_DEV, api_key_id: K1 },
      { id: '22222222-2222-4222-8222-222222222222', developer_id: SHADOW_DEV, api_key_id: K2 },
    ];
  });

  it('deletes the key\'s own webhook', async () => {
    const res = await request(app)
      .delete('/api/developer/webhooks/11111111-1111-4111-8111-111111111111')
      .set('x-test-principal', 'k1');
    expect(res.status).toBe(200);
    expect(state.webhookRows.find((w) => w.id === '11111111-1111-4111-8111-111111111111')).toBeUndefined();
  });

  it('refuses (404) to delete ANOTHER key\'s webhook and leaves it intact', async () => {
    const res = await request(app)
      .delete('/api/developer/webhooks/22222222-2222-4222-8222-222222222222') // K2's webhook
      .set('x-test-principal', 'k1'); // authenticated as K1
    expect(res.status).toBe(404);
    // K2's webhook still present
    expect(state.webhookRows.find((w) => w.id === '22222222-2222-4222-8222-222222222222')).toBeDefined();
  });
});

describe('JWT principal — unchanged portal behaviour (regression)', () => {
  it('lists ALL of the developer\'s webhooks regardless of api_key_id scope', async () => {
    state.webhookRows = [
      { id: 'wh-a', developer_id: REAL_DEV, api_key_id: null, url: 'https://a.example.com', is_sandbox: false, is_active: true, events: [], secret_key: null, created_at: 'x' },
      { id: 'wh-b', developer_id: REAL_DEV, api_key_id: 'some-key', url: 'https://b.example.com', is_sandbox: false, is_active: true, events: [], secret_key: null, created_at: 'x' },
    ];
    const res = await request(app).get('/api/developer/webhooks').set('x-test-principal', 'jwt');
    expect(res.status).toBe(200);
    expect(res.body.webhooks).toHaveLength(2); // not narrowed by api_key_id
  });
});
