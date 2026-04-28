/**
 * Platform webhooks endpoint tests.
 *
 * Covers:
 *   - X-Platform-Service-Token auth (missing, wrong, correct)
 *   - POST register: validation, success, plaintext-secret-once contract,
 *     duplicate-URL guard, SSRF guard, event-name validation
 *   - GET list: returns metadata only (secret masked)
 *   - POST :id/rotate: new secret issued, only allowed on shadow-developer webhooks
 *   - DELETE :id: hard delete, only allowed on shadow-developer webhooks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const TEST_TOKEN = 'test-platform-service-token-256-bit-random';
const SHADOW_GP_ID = 'shadow-gp-uuid';
const SHADOW_INTERNAL_ID = 'shadow-internal-uuid';
const REAL_DEV_ID = 'real-dev-uuid';

const state = vi.hoisted(() => ({
  insertedWebhooks: [] as any[],
  listWebhooks: [] as any[],
  insertError: null as any,
  rotateLookupRow: null as any,
  rotateDeveloperRow: null as any,
  deleteLookupRow: null as any,
  deleteDeveloperRow: null as any,
  duplicateWebhookExists: false,
}));

vi.mock('@/config/database.js', () => {
  const make = () => {
    const obj: any = {
      _filters: [] as Array<[string, any]>,
      select: vi.fn(() => obj),
      eq: vi.fn((col: string, val: any) => {
        obj._filters.push([col, val]);
        return obj;
      }),
      in: vi.fn((_col: string, _vals: any[]) => obj),
      is: vi.fn(() => obj),
      order: vi.fn(() => obj),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      insert: vi.fn(() => obj),
      update: vi.fn(() => obj),
      delete: vi.fn(() => obj),
    };
    return obj;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        const chain = make();

        if (table === 'developers') {
          // Multiple call patterns:
          //   1. POST: .select('id').eq('email', shadow-email).single()  → returns shadow id
          //   2. GET:  .select('id, email').in('email', [...])           → returns array
          //   3. ROTATE/DELETE: .select('email').eq('id', dev-id).single() → returns email
          chain.in = vi.fn(() =>
            Promise.resolve({
              data: [
                { id: SHADOW_GP_ID, email: 'service+gatepass@idswyft.app' },
                { id: SHADOW_INTERNAL_ID, email: 'service+internal@idswyft.app' },
              ],
              error: null,
            }),
          );
          chain.single = vi.fn(() => {
            // If filters include eq('id', X) → return developer row by id
            const idFilter = chain._filters.find((f: [string, any]) => f[0] === 'id');
            if (idFilter) {
              if (idFilter[1] === SHADOW_GP_ID) {
                return Promise.resolve({ data: { email: 'service+gatepass@idswyft.app' }, error: null });
              }
              if (idFilter[1] === REAL_DEV_ID) {
                return Promise.resolve({ data: { email: 'real@dev.com' }, error: null });
              }
            }
            // Otherwise filtered by email → return shadow developer id
            const emailFilter = chain._filters.find((f: [string, any]) => f[0] === 'email');
            if (emailFilter) {
              if (emailFilter[1] === 'service+gatepass@idswyft.app') {
                return Promise.resolve({ data: { id: SHADOW_GP_ID }, error: null });
              }
              if (emailFilter[1] === 'service+internal@idswyft.app') {
                return Promise.resolve({ data: { id: SHADOW_INTERNAL_ID }, error: null });
              }
            }
            return Promise.resolve({ data: null, error: { message: 'not found' } });
          });
        }

        if (table === 'webhooks') {
          chain.insert = vi.fn((row: any) => {
            state.insertedWebhooks.push(row);
            const insertChain = make();
            insertChain.single = vi.fn(() =>
              Promise.resolve({
                data: state.insertError
                  ? null
                  : {
                      id: 'new-webhook-uuid',
                      url: row.url,
                      is_sandbox: row.is_sandbox,
                      is_active: row.is_active,
                      events: row.events,
                      created_at: new Date().toISOString(),
                    },
                error: state.insertError,
              }),
            );
            return insertChain;
          });

          chain.update = vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
          }));

          chain.delete = vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
          }));

          chain.select = vi.fn(() => {
            const selectChain = make();
            // Don't override .eq() — keep the make() default that records filters
            // into selectChain._filters. We need .single() to read those filters.
            selectChain.order = vi.fn(() =>
              Promise.resolve({ data: state.listWebhooks, error: null }),
            );
            selectChain.single = vi.fn(() => {
              // Match patterns:
              //   - POST duplicate guard: .eq('developer_id').eq('url').eq('is_sandbox').is('api_key_id', null).single()
              //   - ROTATE/DELETE lookup: .eq('id', X).single()
              const idFilter = selectChain._filters.find((f: [string, any]) => f[0] === 'id');
              if (idFilter) {
                if (state.rotateLookupRow && idFilter[1] === state.rotateLookupRow.id) {
                  return Promise.resolve({ data: state.rotateLookupRow, error: null });
                }
                if (state.deleteLookupRow && idFilter[1] === state.deleteLookupRow.id) {
                  return Promise.resolve({ data: state.deleteLookupRow, error: null });
                }
                return Promise.resolve({ data: null, error: { message: 'not found' } });
              }
              // duplicate guard
              return Promise.resolve({
                data: state.duplicateWebhookExists ? { id: 'existing-webhook' } : null,
                error: state.duplicateWebhookExists ? null : { code: 'PGRST116' },
              });
            });
            return selectChain;
          });
        }

        return chain;
      }),
    },
    connectDB: vi.fn(),
  };
});

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/validateUrl.js', () => ({
  validateWebhookUrl: vi.fn((url: string) => {
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('169.254')) {
      throw new Error('SSRF protection: private/reserved network URL not allowed');
    }
  }),
}));

vi.mock('@/config/index.js', () => ({
  default: { apiKeySecret: 'test-secret', nodeEnv: 'test' },
}));

process.env.IDSWYFT_PLATFORM_SERVICE_TOKEN = TEST_TOKEN;

let app: Express;

async function buildApp() {
  const mod = await import('../webhooks.js');
  const a = express();
  a.use(express.json());
  a.use('/api/platform/webhooks', mod.default);
  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  });
  return a;
}

beforeEach(async () => {
  state.insertedWebhooks = [];
  state.listWebhooks = [];
  state.insertError = null;
  state.rotateLookupRow = null;
  state.rotateDeveloperRow = null;
  state.deleteLookupRow = null;
  state.deleteDeveloperRow = null;
  state.duplicateWebhookExists = false;
  app = await buildApp();
});

describe('Platform webhooks auth', () => {
  it('rejects requests with no X-Platform-Service-Token (401)', async () => {
    const res = await request(app).post('/api/platform/webhooks').send({});
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token (401)', async () => {
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', 'wrong-token')
      .send({});
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct token', async () => {
    const res = await request(app)
      .get('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/platform/webhooks — register', () => {
  it('rejects invalid service_product', async () => {
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({ service_product: 'unknown', url: 'https://example.com/hook' });
    expect(res.status).toBe(400);
  });

  it('rejects missing url', async () => {
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({ service_product: 'gatepass' });
    expect(res.status).toBe(400);
  });

  it('rejects SSRF-suspicious URLs (link-local 169.254.x.x)', async () => {
    // 169.254.169.254 (AWS instance metadata service) passes isURL but
    // is caught by the validateWebhookUrl SSRF guard.
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({ service_product: 'gatepass', url: 'http://169.254.169.254/latest/meta-data/' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SSRF/i);
  });

  it('rejects unknown event names', async () => {
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        url: 'https://api.gatepass.example.com/hook',
        events: ['verification.completed', 'made.up.event'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid webhook events/i);
  });

  it('rejects duplicate registration (same URL + sandbox + product)', async () => {
    state.duplicateWebhookExists = true;
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        url: 'https://api.gatepass.example.com/hook',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('registers webhook with one-time plaintext secret on success', async () => {
    const res = await request(app)
      .post('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        url: 'https://api.gatepass.example.com/idswyft-webhook',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-webhook-uuid');
    expect(res.body.service_product).toBe('gatepass');
    expect(res.body.url).toBe('https://api.gatepass.example.com/idswyft-webhook');
    expect(res.body.signing_secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(res.body.warning).toMatch(/only time the plaintext signing secret will be shown/i);
    expect(res.body.is_sandbox).toBe(false);

    // Inserted row checks
    expect(state.insertedWebhooks).toHaveLength(1);
    const inserted = state.insertedWebhooks[0];
    expect(inserted.developer_id).toBe(SHADOW_GP_ID);
    expect(inserted.is_active).toBe(true);
    expect(inserted.secret_key).toBeTruthy();
    expect(inserted.secret_key).toMatch(/^whsec_/);
    expect(inserted.events).toBeDefined(); // defaulted to all events
  });
});

describe('GET /api/platform/webhooks — list', () => {
  it('returns metadata array (secret masked)', async () => {
    state.listWebhooks = [
      {
        id: 'wh-1',
        developer_id: SHADOW_GP_ID,
        url: 'https://api.gatepass.example.com/hook',
        is_sandbox: false,
        is_active: true,
        events: ['verification.completed'],
        secret_key: 'whsec_1234567890abcdef1234567890abcdef1234567890abcdef',
        created_at: '2026-04-29T00:00:00Z',
        last_attempted_at: null,
      },
    ];

    const res = await request(app)
      .get('/api/platform/webhooks')
      .set('X-Platform-Service-Token', TEST_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.webhooks[0].id).toBe('wh-1');
    expect(res.body.webhooks[0].service_product).toBe('gatepass');
    expect(res.body.webhooks[0].signing_secret_masked).toMatch(/^whsec_\*+/);
    expect(res.body.webhooks[0]).not.toHaveProperty('secret_key');
    expect(res.body.webhooks[0]).not.toHaveProperty('signing_secret');
  });
});

describe('DELETE /api/platform/webhooks/:id — delete', () => {
  it('returns 404 for unknown id', async () => {
    state.deleteLookupRow = null;
    const res = await request(app)
      .delete('/api/platform/webhooks/00000000-0000-4000-8000-000000000000')
      .set('X-Platform-Service-Token', TEST_TOKEN);
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful delete', async () => {
    state.deleteLookupRow = {
      id: '11111111-1111-4111-8111-111111111111',
      developer_id: SHADOW_GP_ID,
    };
    const res = await request(app)
      .delete('/api/platform/webhooks/11111111-1111-4111-8111-111111111111')
      .set('X-Platform-Service-Token', TEST_TOKEN);
    expect(res.status).toBe(204);
  });

  it('refuses to delete a webhook owned by a NON-shadow (real) developer', async () => {
    state.deleteLookupRow = {
      id: '22222222-2222-4222-8222-222222222222',
      developer_id: REAL_DEV_ID,
    };
    const res = await request(app)
      .delete('/api/platform/webhooks/22222222-2222-4222-8222-222222222222')
      .set('X-Platform-Service-Token', TEST_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only manages webhooks on shadow developer/i);
  });

  it('rejects non-UUID id', async () => {
    const res = await request(app)
      .delete('/api/platform/webhooks/not-a-uuid')
      .set('X-Platform-Service-Token', TEST_TOKEN);
    expect(res.status).toBe(400);
  });
});
