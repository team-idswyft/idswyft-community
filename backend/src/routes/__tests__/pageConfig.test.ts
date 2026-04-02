/**
 * Test: GET /api/v2/verify/page-config
 *
 * Unit tests for the public page-config endpoint that returns developer branding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockKeyRecord: any = null;
let mockDeveloperRow: any = null;

function createQueryBuilder(table: string) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(() => {
      if (table === 'api_keys') return { data: mockKeyRecord, error: null };
      if (table === 'developers') return { data: mockDeveloperRow, error: null };
      return { data: null, error: null };
    }),
  };
  return builder;
}

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: vi.fn((table: string) => createQueryBuilder(table)),
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logError: vi.fn(),
  logVerificationEvent: vi.fn(),
}));

vi.mock('@/config/index.js', () => ({
  default: {
    encryptionKey: 'test-key-32-bytes-long-1234567890',
    apiKeySecret: 'test-api-key-secret',
  },
  config: {
    encryptionKey: 'test-key-32-bytes-long-1234567890',
    apiKeySecret: 'test-api-key-secret',
  },
}));

vi.mock('@/middleware/rateLimit.js', () => ({
  basicRateLimit: (_req: any, _res: any, next: any) => next(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Page Config Endpoint', () => {
  beforeEach(() => {
    mockKeyRecord = null;
    mockDeveloperRow = null;
  });

  async function buildApp() {
    const { default: pageConfigRouter } = await import('../pageConfig.js');
    const express = await import('express');
    const request = (await import('supertest')).default;

    const app = express.default();
    app.use(express.default.json());
    app.use('/api/v2/verify', pageConfigRouter);

    return { app, request };
  }

  it('returns 400 without api_key param', { timeout: 15000 }, async () => {
    const { app, request } = await buildApp();

    const res = await request(app).get('/api/v2/verify/page-config');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/api_key/i);
  });

  it('returns empty branding for invalid key (prevents enumeration)', async () => {
    mockKeyRecord = null;

    const { app, request } = await buildApp();

    const res = await request(app).get('/api/v2/verify/page-config?api_key=ik_invalid');
    expect(res.status).toBe(200);
    expect(res.body.branding.logo_url).toBeNull();
    expect(res.body.branding.accent_color).toBeNull();
    expect(res.body.branding.company_name).toBeNull();
  });

  it('returns default nulls when no branding configured', async () => {
    mockKeyRecord = { developer_id: 'dev-001' };
    mockDeveloperRow = {
      branding_logo_url: null,
      branding_accent_color: null,
      branding_company_name: null,
      company: null,
    };

    const { app, request } = await buildApp();

    const res = await request(app).get('/api/v2/verify/page-config?api_key=ik_validkey');
    expect(res.status).toBe(200);
    expect(res.body.branding.logo_url).toBeNull();
    expect(res.body.branding.accent_color).toBeNull();
    expect(res.body.branding.company_name).toBeNull();
  });

  it('returns correct branding when configured', async () => {
    mockKeyRecord = { developer_id: 'dev-001' };
    mockDeveloperRow = {
      branding_logo_url: 'https://example.com/logo.png',
      branding_accent_color: '#ff6600',
      branding_company_name: 'Acme Corp',
      company: 'Acme Inc',
    };

    const { app, request } = await buildApp();

    const res = await request(app).get('/api/v2/verify/page-config?api_key=ik_validkey');
    expect(res.status).toBe(200);
    expect(res.body.branding.logo_url).toBe('https://example.com/logo.png');
    expect(res.body.branding.accent_color).toBe('#ff6600');
    expect(res.body.branding.company_name).toBe('Acme Corp');
  });

  it('falls back company_name to profile company field', async () => {
    mockKeyRecord = { developer_id: 'dev-001' };
    mockDeveloperRow = {
      branding_logo_url: null,
      branding_accent_color: null,
      branding_company_name: null,
      company: 'Fallback Inc',
    };

    const { app, request } = await buildApp();

    const res = await request(app).get('/api/v2/verify/page-config?api_key=ik_validkey');
    expect(res.status).toBe(200);
    expect(res.body.branding.company_name).toBe('Fallback Inc');
  });

  it('sets Cache-Control header', async () => {
    mockKeyRecord = { developer_id: 'dev-001' };
    mockDeveloperRow = {
      branding_logo_url: null,
      branding_accent_color: null,
      branding_company_name: null,
      company: null,
    };

    const { app, request } = await buildApp();

    const res = await request(app).get('/api/v2/verify/page-config?api_key=ik_validkey');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });
});
