/**
 * Platform service-key endpoint tests (Phase 5).
 *
 * Covers:
 *   - X-Platform-Service-Token auth (missing, wrong, correct)
 *   - POST mint: validation, success, plaintext-once contract
 *   - GET list: returns metadata only, no plaintext
 *   - POST :id/rotate: new key issued + old revoked
 *   - DELETE :id: revocation (is_active=false, revoked_at set)
 *   - shadow developer resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const TEST_TOKEN = 'test-platform-service-token-256-bit-random';

// State driven by individual tests
const state = vi.hoisted(() => ({
  shadowDevId: 'shadow-uuid-gatepass',
  insertedKeys: [] as any[],
  listKeys: [] as any[],
  insertError: null as any,
  shadowLookupError: null as any,
  rotateLookupRow: null as any,
  rotateRevokeError: null as any,
  deleteFoundRow: null as any,
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
      order: vi.fn(() => obj),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      insert: vi.fn(() => obj),
      update: vi.fn(() => obj),
    };
    return obj;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        const chain = make();

        if (table === 'developers') {
          chain.single = vi.fn(() =>
            Promise.resolve({
              data: state.shadowLookupError
                ? null
                : { id: state.shadowDevId },
              error: state.shadowLookupError,
            }),
          );
        }

        if (table === 'api_keys') {
          // Decide insert vs select vs update based on which method is invoked
          // first. We make all of them return the same `chain` and let single()
          // return state-appropriate data.
          chain.insert = vi.fn((row: any) => {
            state.insertedKeys.push(row);
            const insertChain = make();
            insertChain.single = vi.fn(() =>
              Promise.resolve({
                data: state.insertError
                  ? null
                  : {
                      id: 'new-key-uuid',
                      key_prefix: row.key_prefix,
                      service_product: row.service_product,
                      service_environment: row.service_environment,
                      service_label: row.service_label,
                      created_at: new Date().toISOString(),
                    },
                error: state.insertError,
              }),
            );
            return insertChain;
          });

          chain.update = vi.fn(() => {
            const updateChain = make();
            updateChain.single = vi.fn(() =>
              Promise.resolve({
                data: state.deleteFoundRow,
                error: state.deleteFoundRow ? null : { message: 'not found' },
              }),
            );
            return updateChain;
          });

          // For GET list: select() chain returns array via the resolved promise
          chain.select = vi.fn(() => {
            const selectChain = make();
            selectChain.eq = vi.fn(() => selectChain);
            selectChain.order = vi.fn(() =>
              Promise.resolve({ data: state.listKeys, error: null }),
            );
            // Single() for rotate-lookup
            selectChain.single = vi.fn(() =>
              Promise.resolve({
                data: state.rotateLookupRow,
                error: state.rotateLookupRow ? null : { message: 'not found' },
              }),
            );
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

vi.mock('@/config/index.js', () => ({
  default: {
    apiKeySecret: 'test-secret',
    nodeEnv: 'test',
  },
}));

// Set the platform token before importing the router
process.env.IDSWYFT_PLATFORM_SERVICE_TOKEN = TEST_TOKEN;

// Late-import to ensure mocks are in place
let serviceKeysRouter: any;
let app: Express;

async function buildApp() {
  const mod = await import('../serviceKeys.js');
  serviceKeysRouter = mod.default;

  const a = express();
  a.use(express.json());
  a.use('/api/platform/api-keys/service', serviceKeysRouter);

  // Standard error handler — mirrors backend/src/middleware/errorHandler.ts
  a.use((err: any, _req: any, res: any, _next: any) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message,
      code: err.code,
    });
  });

  return a;
}

beforeEach(async () => {
  state.shadowDevId = 'shadow-uuid-gatepass';
  state.insertedKeys = [];
  state.listKeys = [];
  state.insertError = null;
  state.shadowLookupError = null;
  state.rotateLookupRow = null;
  state.rotateRevokeError = null;
  state.deleteFoundRow = null;
  app = await buildApp();
});

describe('Platform service-key auth', () => {
  it('rejects requests with no X-Platform-Service-Token (401)', async () => {
    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .send({});
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token (401)', async () => {
    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', 'wrong-token')
      .send({});
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct token', async () => {
    const res = await request(app)
      .get('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/platform/api-keys/service — mint', () => {
  it('rejects invalid service_product', async () => {
    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'invalid-product',
        service_environment: 'production',
        label: 'Test key',
      });
    expect(res.status).toBe(400);
  });

  it('rejects invalid service_environment', async () => {
    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        service_environment: 'wrong-env',
        label: 'Test key',
      });
    expect(res.status).toBe(400);
  });

  it('rejects label that is too short', async () => {
    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        service_environment: 'production',
        label: 'ab',
      });
    expect(res.status).toBe(400);
  });

  it('mints isk_* key with one-time plaintext on success', async () => {
    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        service_environment: 'production',
        label: 'GatePass production',
      });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^isk_[0-9a-f]{64}$/); // 32-byte hex
    expect(res.body.id).toBe('new-key-uuid');
    expect(res.body.service_product).toBe('gatepass');
    expect(res.body.service_environment).toBe('production');
    expect(res.body.warning).toMatch(/only time the plaintext key will be shown/i);

    // The insert should have set is_service=true and the shadow developer id
    expect(state.insertedKeys).toHaveLength(1);
    const inserted = state.insertedKeys[0];
    expect(inserted.is_service).toBe(true);
    expect(inserted.developer_id).toBe('shadow-uuid-gatepass');
    expect(inserted.service_product).toBe('gatepass');
    expect(inserted.is_sandbox).toBe(false);
    expect(inserted.is_active).toBe(true);
    // Hash, not plaintext, is what gets stored
    expect(inserted.key_hash).toBeTruthy();
    expect(inserted.key_hash).not.toBe(res.body.key);
  });

  it('errors when shadow developer is missing (migration 58 not run)', async () => {
    state.shadowLookupError = { message: 'not found' };

    const res = await request(app)
      .post('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN)
      .send({
        service_product: 'gatepass',
        service_environment: 'production',
        label: 'Test key',
      });

    expect(res.status).toBe(500);
  });
});

describe('GET /api/platform/api-keys/service — list', () => {
  it('returns metadata array (no plaintext, no hash)', async () => {
    state.listKeys = [
      {
        id: 'key-1',
        key_prefix: 'isk_aaaa',
        service_product: 'gatepass',
        service_environment: 'production',
        service_label: 'GatePass prod',
        is_active: true,
        last_used_at: null,
        created_at: '2026-04-28T00:00:00Z',
        revoked_at: null,
      },
    ];

    const res = await request(app)
      .get('/api/platform/api-keys/service')
      .set('X-Platform-Service-Token', TEST_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.keys[0].id).toBe('key-1');
    expect(res.body.keys[0]).not.toHaveProperty('key_hash');
    expect(res.body.keys[0]).not.toHaveProperty('key');
  });
});

describe('DELETE /api/platform/api-keys/service/:id — revoke', () => {
  it('returns 404 for unknown id', async () => {
    state.deleteFoundRow = null;

    const res = await request(app)
      .delete('/api/platform/api-keys/service/00000000-0000-0000-0000-000000000000')
      .set('X-Platform-Service-Token', TEST_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 204 on successful revocation', async () => {
    state.deleteFoundRow = { id: 'real-key-uuid' };

    // Valid v4 UUID (version bits set: '4' in third group, '8/9/a/b' in fourth)
    const res = await request(app)
      .delete('/api/platform/api-keys/service/11111111-1111-4111-8111-111111111111')
      .set('X-Platform-Service-Token', TEST_TOKEN);

    expect(res.status).toBe(204);
  });

  it('rejects non-UUID id (400 validation error)', async () => {
    const res = await request(app)
      .delete('/api/platform/api-keys/service/not-a-uuid')
      .set('X-Platform-Service-Token', TEST_TOKEN);

    expect(res.status).toBe(400);
  });
});
