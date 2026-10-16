/**
 * VaaS service endpoints — input validation (HIGH finding 4).
 *
 * POST /users and POST /verify previously had no request-body validation:
 * an invalid email was passed straight to the insert, and an invalid/missing
 * user_id, document_url, or selfie_url was silently dropped (destructured
 * but never checked) rather than rejected. This guards the express-validator
 * chains added to both routes, matching the pattern used by other routers
 * (e.g. GET/POST /developers/:id with `param('id').isUUID()`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

vi.mock('@/config/database.js', () => ({ supabase: {}, connectDB: vi.fn() }));

vi.mock('@/middleware/auth.js', () => ({
  authenticateServiceToken: (req: any, _res: any, next: any) => {
    next();
  },
}));

vi.mock('@/services/storage.js', () => ({
  resolvePublicAssetUrl: (url: string) => url,
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let app: Express;
async function buildApp() {
  const mod = await import('../vaas.js');
  const a = express();
  a.use(express.json());
  a.use('/api/vaas', mod.default);
  a.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.statusCode || 500).json({ error: err.message }));
  return a;
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
});

describe('POST /api/vaas/users — input validation', () => {
  it('rejects a missing email', async () => {
    const res = await request(app).post('/api/vaas/users').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/vaas/users').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/vaas/verify — input validation', () => {
  it('rejects a non-UUID user_id', async () => {
    const res = await request(app)
      .post('/api/vaas/verify')
      .send({ user_id: 'not-a-uuid', document_url: 'https://example.com/doc.jpg' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing document_url instead of silently dropping it', async () => {
    const res = await request(app)
      .post('/api/vaas/verify')
      .send({ user_id: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid selfie_url instead of silently dropping it', async () => {
    const res = await request(app)
      .post('/api/vaas/verify')
      .send({
        user_id: '11111111-1111-4111-8111-111111111111',
        document_url: 'https://example.com/doc.jpg',
        selfie_url: 'not-a-url',
      });
    expect(res.status).toBe(400);
  });
});
