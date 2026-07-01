/**
 * Legacy POST /api/webhooks/register — per-key scoping for service keys.
 *
 * Security regression guard. The legacy register route authenticates with
 * X-API-Key (authenticateAPIKey), which admits isk_* SERVICE keys. Service keys
 * for a product share one shadow developer row, so developer_id is NOT a tenant
 * boundary — api_key_id is. Before the fix, this route created webhooks with a
 * NULL api_key_id, meaning a service key K2 could plant a product-wide webhook
 * that receives verification PII belonging to sibling key K1 (delivery matches
 * `api_key_id IS NULL OR = <key>`). The route must HARD-SET api_key_id to the
 * calling service key's own id, mirroring developer/webhooks.ts. Regular
 * developer keys keep api_key_id NULL (developer_id is their real boundary).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const SHADOW_DEV = 'shadow-dev-uuid';
const REAL_DEV = 'real-dev-uuid';
const K1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

const state = vi.hoisted(() => ({ createArgs: [] as any[] }));

// Trivial database stub: the route path is fully served by the mocked
// WebhookService below, so no real supabase is needed. This also prevents the
// real @/config/database.js from throwing on missing DB config when the real
// auth module is loaded via importOriginal().
vi.mock('@/config/database.js', () => ({ supabase: {}, connectDB: vi.fn() }));

// Mock WebhookService: capture createWebhook input; getWebhookByUrl → null (proceed to create).
vi.mock('@/services/webhook.js', () => ({
  WebhookService: class {
    getWebhookByUrl = vi.fn(async () => null);
    createWebhook = vi.fn(async (data: any) => {
      state.createArgs.push(data);
      return { id: 'created-webhook-uuid', ...data };
    });
  },
  createWebhookSignature: vi.fn(),
}));

// Stub auth so we can drive each principal via a header.
vi.mock('@/middleware/auth.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const setPrincipal = (req: any, res: any, next: any) => {
    const who = req.headers['x-test-principal'];
    if (who === 'service') {
      req.developer = { id: SHADOW_DEV, status: 'active' };
      req.apiKey = { id: K1, is_service: true };
    } else if (who === 'developer') {
      req.developer = { id: REAL_DEV, status: 'active' };
      req.apiKey = { id: 'regular-key-uuid', is_service: false };
    } else {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    next();
  };
  return { ...actual, authenticateAPIKey: setPrincipal };
});

vi.mock('@/utils/validateUrl.js', () => ({
  validateWebhookUrl: vi.fn(async () => {}),
}));
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let app: Express;
async function buildApp() {
  const mod = await import('../webhooks.js');
  const a = express();
  a.use(express.json());
  a.use('/api/webhooks', mod.default);
  a.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.statusCode || 500).json({ error: err.message }));
  return a;
}

beforeEach(async () => {
  state.createArgs = [];
  app = await buildApp();
});

describe('POST /api/webhooks/register — per-key scoping', () => {
  it('hard-sets api_key_id to the calling service key (no cross-key NULL webhook)', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/hook' })
      .set('x-test-principal', 'service');

    expect(res.status).toBe(201);
    expect(state.createArgs).toHaveLength(1);
    // The security property: the webhook is scoped to THIS service key, not NULL.
    expect(state.createArgs[0].api_key_id).toBe(K1);
  });

  it('leaves api_key_id null for a regular developer key (developer_id is the boundary)', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/hook' })
      .set('x-test-principal', 'developer');

    expect(res.status).toBe(201);
    expect(state.createArgs).toHaveLength(1);
    expect(state.createArgs[0].api_key_id ?? null).toBeNull();
  });
});
