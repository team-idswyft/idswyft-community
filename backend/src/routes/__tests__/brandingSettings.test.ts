/**
 * Test: GET/PUT /api/developer/settings/branding
 *
 * Unit tests for the branding settings endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockDeveloperRow: any = {};
let lastUpdate: any = null;

function createQueryBuilder(resolveWith: any) {
  let isUpdate = false;
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(() => {
      // After update(), eq() terminates the chain — return a resolved promise shape
      if (isUpdate) return Promise.resolve({ data: null, error: null });
      return builder;
    }),
    single: vi.fn().mockReturnValue({ data: resolveWith, error: null }),
    update: vi.fn((data: any) => { lastUpdate = data; isUpdate = true; return builder; }),
  };
  return builder;
}

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'developers') return createQueryBuilder(mockDeveloperRow);
      return createQueryBuilder(null);
    }),
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logError: vi.fn(),
  logVerificationEvent: vi.fn(),
}));

vi.mock('@/config/index.js', () => ({
  default: { encryptionKey: 'test-key-32-bytes-long-1234567890' },
  config: { encryptionKey: 'test-key-32-bytes-long-1234567890' },
}));

vi.mock('@idswyft/shared', () => ({
  encryptSecret: vi.fn((v: string) => `enc:${v}`),
  decryptSecret: vi.fn((v: string) => v.replace('enc:', '')),
  maskApiKey: vi.fn((v: string) => `${v.slice(0, 4)}****`),
}));

// Mock auth to pass through with req.developer set
vi.mock('@/middleware/auth.js', () => ({
  authenticateDeveloperJWT: (req: any, _res: any, next: any) => {
    req.developer = { id: 'dev-001' };
    next();
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Branding Settings Endpoints', () => {
  beforeEach(() => {
    mockDeveloperRow = {};
    lastUpdate = null;
  });

  async function buildApp() {
    const { default: settingsRouter } = await import('../developer/settings.js');
    const express = await import('express');
    const request = (await import('supertest')).default;

    const app = express.default();
    app.use(express.default.json());
    app.use(settingsRouter);

    return { app, request };
  }

  describe('GET /settings/branding', () => {
    it('returns configured: false for fresh developer', async () => {
      mockDeveloperRow = {
        branding_logo_url: null,
        branding_accent_color: null,
        branding_company_name: null,
      };

      const { app, request } = await buildApp();
      const res = await request(app).get('/settings/branding');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.logo_url).toBeNull();
      expect(res.body.accent_color).toBeNull();
      expect(res.body.company_name).toBeNull();
    });

    it('returns configured: true when branding is set', async () => {
      mockDeveloperRow = {
        branding_logo_url: 'https://example.com/logo.png',
        branding_accent_color: '#ff6600',
        branding_company_name: 'Acme Corp',
      };

      const { app, request } = await buildApp();
      const res = await request(app).get('/settings/branding');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.logo_url).toBe('https://example.com/logo.png');
      expect(res.body.accent_color).toBe('#ff6600');
      expect(res.body.company_name).toBe('Acme Corp');
    });
  });

  describe('PUT /settings/branding', () => {
    it('saves branding values', async () => {
      mockDeveloperRow = {};

      const { app, request } = await buildApp();
      const res = await request(app)
        .put('/settings/branding')
        .send({
          logo_url: 'https://example.com/logo.png',
          accent_color: '#22d3ee',
          company_name: 'Test Company',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logo_url).toBe('https://example.com/logo.png');
      expect(res.body.accent_color).toBe('#22d3ee');
      expect(res.body.company_name).toBe('Test Company');
    });

    it('rejects invalid hex color', async () => {
      const { app, request } = await buildApp();
      const res = await request(app)
        .put('/settings/branding')
        .send({ accent_color: 'not-a-color' });

      expect(res.status).toBe(400);
    });

    it('rejects invalid URL', async () => {
      const { app, request } = await buildApp();
      const res = await request(app)
        .put('/settings/branding')
        .send({ logo_url: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('clears branding with all nulls', async () => {
      mockDeveloperRow = {};

      const { app, request } = await buildApp();
      const res = await request(app)
        .put('/settings/branding')
        .send({ logo_url: null, accent_color: null, company_name: null });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logo_url).toBeNull();
      expect(res.body.accent_color).toBeNull();
      expect(res.body.company_name).toBeNull();
    });
  });
});
