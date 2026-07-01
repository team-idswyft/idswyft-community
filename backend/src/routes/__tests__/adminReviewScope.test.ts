/**
 * Operator scoping on the admin review surface: queue isolation, detail/action
 * cross-key 404, operator-email attribution, and per-key webhook delivery.
 * Auth stubbed via x-test-principal; supabase mock is a filter-applying engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const SHADOW_DEV = 'shadow-dev-uuid-0001';
const K1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const K2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const V_K1 = '11111111-aaaa-4aaa-8aaa-111111111111';
const V_K2 = '22222222-bbbb-4bbb-8bbb-222222222222';
// Valid UUID passed as ?developer_id= to prove the operator ignores it
const IGNORED_DEV_UUID = '00000000-0000-4000-8000-000000000099';

const state = vi.hoisted(() => ({ verificationRows: [] as any[] }));
const webhookSpy = vi.hoisted(() => ({
  getActive: vi.fn(async () => [] as any[]),
  send: vi.fn(async () => {}),
}));

// ─── Supabase mock: filter-applying engine ────────────────────────────────────
// Supports eq(), in(), order(), range(), limit(), maybeSingle(), single(), and
// thenable await. The update() entry-point captures the payload into _update so
// approveVerification's .update({...}).eq().select('*').single() mutates the row
// and returns the updated shape (reviewed_by, manual_review_reason, etc.).
vi.mock('@/config/database.js', () => {
  const applyFilters = (rows: any[], filters: Array<[string, any]>) =>
    rows.filter((r) =>
      filters.every(([c, v]) => {
        if (c.startsWith('__in__')) {
          const col = c.slice(6);
          return Array.isArray(v) && v.includes(r[col]);
        }
        return v === null ? r[c] == null : r[c] === v;
      }),
    );

  const makeChain = (rows: any[], initialUpdate?: any) => {
    const filters: Array<[string, any]> = [];
    const chain: any = {
      select: () => chain,
      update: (payload: any) => { chain._update = payload; return chain; },
      eq: (c: string, v: any) => { filters.push([c, v]); return chain; },
      in: (c: string, vals: any[]) => { filters.push([`__in__${c}`, vals]); return chain; },
      order: () => chain,
      range: () => {
        const d = applyFilters(rows, filters);
        return Promise.resolve({ data: d, error: null, count: d.length });
      },
      limit: () => Promise.resolve({ data: applyFilters(rows, filters), error: null }),
      maybeSingle: () => {
        const m = applyFilters(rows, filters);
        return Promise.resolve({ data: m.length ? m[0] : null, error: null });
      },
      single: () => {
        const m = applyFilters(rows, filters);
        if (!m.length) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        if (chain._update) Object.assign(m[0], chain._update);
        return Promise.resolve({ data: m[0], error: null });
      },
      then: (res: any, rej?: any) => {
        const d = applyFilters(rows, filters);
        return Promise.resolve({ data: d, error: null, count: d.length }).then(res, rej);
      },
    };
    if (initialUpdate !== undefined) chain._update = initialUpdate;
    return chain;
  };

  return {
    supabase: {
      from: (t: string) => {
        if (t === 'verification_requests') {
          return {
            // select path: read-only chain, no _update
            select: () => makeChain(state.verificationRows),
            // update path: chain pre-loaded with the payload so single() applies it
            update: (payload: any) => makeChain(state.verificationRows, payload),
          };
        }
        // documents, selfies, and all other tables — return empty rows
        return { select: () => makeChain([]) };
      },
    },
    connectDB: vi.fn(),
  };
});

vi.mock('@/services/webhook.js', () => ({
  WebhookService: class {
    getActiveWebhooksForDeveloper = webhookSpy.getActive;
    sendWebhook = webhookSpy.send;
  },
  createWebhookSignature: vi.fn(),
}));

// ─── Auth stub ────────────────────────────────────────────────────────────────
// Replaces authenticateReviewPrincipal only; all other auth exports remain real.
vi.mock('@/middleware/auth.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const setPrincipal = (req: any, res: any, next: any) => {
    const who = req.headers['x-test-principal'];
    if (who === 'operator') {
      req.developer = { id: SHADOW_DEV };
      req.operatorKeyId = K1;
      req.operatorEmail = 'op@example.com';
      req.apiKey = { id: K1, is_service: true };
    } else if (who === 'admin') {
      req.user = { id: 'admin-1' };
    } else {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    next();
  };
  return { ...actual, authenticateReviewPrincipal: setPrincipal };
});

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── App factory ──────────────────────────────────────────────────────────────
let app: Express;

async function buildApp() {
  const adminMod = await import('../admin.js');
  const a = express();
  a.use(express.json());
  a.use('/api/admin', adminMod.default);
  a.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.statusCode || 500).json({ error: err.message }),
  );
  return a;
}

beforeEach(async () => {
  state.verificationRows = [];
  webhookSpy.getActive.mockClear();
  webhookSpy.send.mockClear();
  webhookSpy.getActive.mockResolvedValue([]);
  app = await buildApp();
});

// ─── Queue isolation ──────────────────────────────────────────────────────────

describe('GET /api/admin/verifications — operator queue isolation', () => {
  it('returns only the operator key K1 rows, ignoring ?developer_id', async () => {
    state.verificationRows = [
      { id: V_K1, developer_id: SHADOW_DEV, api_key_id: K1, status: 'manual_review' },
      { id: V_K2, developer_id: SHADOW_DEV, api_key_id: K2, status: 'manual_review' },
    ];
    // Pass a valid UUID as developer_id — operator must ignore it and scope to K1 only.
    const res = await request(app)
      .get(`/api/admin/verifications?developer_id=${IGNORED_DEV_UUID}`)
      .set('x-test-principal', 'operator');
    expect(res.status).toBe(200);
    const ids = (res.body.verifications || res.body.data || []).map((v: any) => v.id);
    expect(ids).toContain(V_K1);
    expect(ids).not.toContain(V_K2);
  });
});

// ─── Action: cross-key 404, attribution, per-key webhook ─────────────────────

describe('PUT /api/admin/verification/:id/review — operator cross-key + attribution + webhook', () => {
  it("404 when reviewing another key's verification", async () => {
    state.verificationRows = [
      { id: V_K2, developer_id: SHADOW_DEV, api_key_id: K2, status: 'manual_review' },
    ];
    const res = await request(app)
      .put(`/api/admin/verification/${V_K2}/review`)
      .send({ decision: 'approve' })
      .set('x-test-principal', 'operator');
    expect(res.status).toBe(404);
  });

  it("approves own key's verification, records operator email, fires only K1 webhook", async () => {
    state.verificationRows = [
      {
        id: V_K1,
        developer_id: SHADOW_DEV,
        api_key_id: K1,
        status: 'manual_review',
        is_sandbox: false,
        user_id: 'u1',
      },
    ];
    const res = await request(app)
      .put(`/api/admin/verification/${V_K1}/review`)
      .send({ decision: 'approve' })
      .set('x-test-principal', 'operator');

    expect(res.status).toBe(200);
    expect(res.body.verification.reviewed_by).toBe('op@example.com');
    expect(res.body.verification.manual_review_reason).toBe('Manually approved by op@example.com');

    // Flush microtasks so the fire-and-forget webhook block completes before we assert.
    await new Promise((r) => setImmediate(r));

    // Webhook scoped to the verification's api_key_id (K1) — load-bearing security guard.
    // If the 4th arg is removed from admin.ts, this assertion fails (4th arg becomes undefined).
    expect(webhookSpy.getActive).toHaveBeenCalledWith(SHADOW_DEV, false, 'verification.completed', K1);
  });
});
