/**
 * Service-key auth detection tests.
 *
 * Covers the Phase 2 changes to auth.ts:
 *   - authenticateAPIKey surfaces is_service / service_product / service_environment
 *     and sets req.isService
 *   - checkSandboxMode short-circuits for service keys
 *   - checkPremiumAccess marks service keys as premium (full access)
 *
 * Pure-unit style — mocks Supabase + crypto so the test runs without a DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Hoisted mock state so vi.mock factories can reference it
const mockState = vi.hoisted(() => ({
  apiKeyRow: null as any,
  shouldUpdateLastUsed: true,
}));

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: mockState.apiKeyRow,
                error: mockState.apiKeyRow ? null : { message: 'not found' },
              }),
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    connectDB: vi.fn(),
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/index.js', () => ({
  default: {
    apiKeySecret: 'test-secret-for-hmac',
    nodeEnv: 'production',
  },
}));

import {
  authenticateAPIKey,
  checkSandboxMode,
  checkPremiumAccess,
} from '../auth.js';

const makeReq = (apiKey?: string): Request =>
  ({
    headers: apiKey ? { 'x-api-key': apiKey } : {},
    body: {},
    query: {},
    ip: '127.0.0.1',
    get: (header: string) => (header === 'User-Agent' ? 'test' : undefined),
  }) as unknown as Request;

const makeRes = (): Response => ({} as Response);

const makeNext = (): NextFunction & { called: number; lastError?: any } => {
  const next: any = (err?: any) => {
    next.called += 1;
    next.lastError = err;
  };
  next.called = 0;
  return next;
};

describe('authenticateAPIKey — service-key detection (Phase 2)', () => {
  beforeEach(() => {
    mockState.apiKeyRow = null;
  });

  it('sets req.isService = true and surfaces service fields for an isk_* key', async () => {
    const shadowDeveloper = {
      id: 'shadow-dev-uuid',
      email: 'service+gatepass@idswyft.app',
      name: 'GatePass Service Account',
      status: 'active',
    };

    mockState.apiKeyRow = {
      id: 'key-uuid',
      developer_id: shadowDeveloper.id,
      key_prefix: 'isk_aaaa',
      is_sandbox: false,
      is_active: true,
      is_service: true,
      service_product: 'gatepass',
      service_environment: 'production',
      service_label: 'GatePass production',
      developer: shadowDeveloper,
    };

    const req = makeReq('isk_test_key_value');
    const next = makeNext();

    await (authenticateAPIKey as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(req.isService).toBe(true);
    expect(req.apiKey?.is_service).toBe(true);
    expect(req.apiKey?.service_product).toBe('gatepass');
    expect(req.apiKey?.service_environment).toBe('production');
    expect(req.developer?.id).toBe(shadowDeveloper.id); // shadow developer attached
  });

  it('sets req.isService = false for a normal ik_* developer key', async () => {
    const developer = {
      id: 'real-dev-uuid',
      email: 'dev@example.com',
      name: 'Real Developer',
      status: 'active',
    };

    mockState.apiKeyRow = {
      id: 'key-uuid-2',
      developer_id: developer.id,
      key_prefix: 'ik_bbbb',
      is_sandbox: false,
      is_active: true,
      is_service: false,
      service_product: null,
      service_environment: null,
      developer,
    };

    const req = makeReq('ik_test_key_value');
    const next = makeNext();

    await (authenticateAPIKey as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(req.isService).toBe(false);
    expect(req.apiKey?.is_service).toBe(false);
    expect(req.developer?.id).toBe(developer.id);
  });

  it('treats undefined is_service as false (legacy rows pre-migration-58)', async () => {
    const developer = {
      id: 'legacy-dev-uuid',
      email: 'legacy@example.com',
      name: 'Legacy Developer',
      status: 'active',
    };

    mockState.apiKeyRow = {
      id: 'legacy-key-uuid',
      developer_id: developer.id,
      key_prefix: 'ik_cccc',
      is_sandbox: false,
      is_active: true,
      // is_service field absent (legacy row before migration 58 ran)
      developer,
    };

    const req = makeReq('ik_legacy_key');
    const next = makeNext();

    await (authenticateAPIKey as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(req.isService).toBe(false);
  });
});

describe('checkSandboxMode — service-key bypass (Phase 2)', () => {
  it('short-circuits for service keys: req.isSandbox = false, no env check', () => {
    const req = makeReq() as any;
    req.apiKey = { is_service: true, is_sandbox: false };
    req.body = { sandbox: true }; // would normally throw for ik_* prod key
    const next = makeNext();

    checkSandboxMode(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(next.lastError).toBeUndefined();
    expect(req.isSandbox).toBe(false);
  });

  it('still throws for ik_* sandbox key in production env (regression)', () => {
    const req = makeReq() as any;
    req.apiKey = { is_service: false, is_sandbox: true };
    const next = makeNext();

    expect(() => checkSandboxMode(req, makeRes(), next)).toThrow(
      /Sandbox API keys cannot be used in production/,
    );
  });
});

describe('checkPremiumAccess — service-key full access (Phase 2)', () => {
  it('sets req.isPremium = true for service keys', async () => {
    const req = makeReq() as any;
    req.apiKey = { is_service: true };
    const next = makeNext();

    await (checkPremiumAccess as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(req.isPremium).toBe(true);
  });

  it('sets req.isPremium = false for normal developer keys (regression)', async () => {
    const req = makeReq() as any;
    req.apiKey = { is_service: false };
    req.developer = { id: 'dev', email: 'd@x.com', name: 'D', status: 'active' };
    const next = makeNext();

    await (checkPremiumAccess as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(req.isPremium).toBe(false);
  });

  it('skips when no developer attached (anonymous request)', async () => {
    const req = makeReq() as any;
    const next = makeNext();

    await (checkPremiumAccess as any)(req, makeRes(), next);

    expect(next.called).toBe(1);
    expect(req.isPremium).toBeUndefined();
  });
});
