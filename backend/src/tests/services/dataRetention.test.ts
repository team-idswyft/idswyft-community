import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock transitive dependencies ─────────────────────────────────────────────
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Build a chainable supabase mock that resolves at the terminal call
const makeChainableMock = (resolveWith: any = { data: [], error: null }) => {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveWith),
  };
  // Terminal awaitable — the chain itself resolves
  chain.then = (resolve: any) => resolve(resolveWith);
  return chain;
};

vi.mock('@/config/database.js', () => ({
  supabase: { from: vi.fn() },
  connectDB: vi.fn(),
}));

vi.mock('@/config/index.js', () => ({
  default: {
    nodeEnv: 'test',
    storage: { provider: 'local' },
    supabase: { storageBucket: 'identity-documents' },
  },
}));

vi.mock('../../services/storage.js', () => ({
  StorageService: class {
    deleteFile = vi.fn().mockResolvedValue(undefined);
    storeDocument = vi.fn();
    storeSelfie = vi.fn();
    downloadFile = vi.fn();
    getFile = vi.fn();
  },
}));

import { supabase } from '@/config/database.js';

describe('DataRetentionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes user documents but keeps anonymized audit record', async () => {
    // Stub supabase responses for each query in deleteUserData
    (supabase.from as any)
      .mockImplementationOnce(() => {
        // verification_requests SELECT (with documents/selfies sub-selects)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'ver-1',
                documents: [{ file_path: 'documents/doc1.jpg' }],
                selfies: [{ file_path: 'selfies/selfie1.jpg' }],
              },
            ],
            error: null,
          }),
        };
      })
      .mockImplementation(() => makeChainableMock({ data: null, error: null }));

    const { DataRetentionService } = await import('../../services/dataRetention.js');
    const service = new DataRetentionService();

    await expect(service.deleteUserData('user-1', 'gdpr-request')).resolves.not.toThrow();

    // supabase.from should have been called for:
    // verification_requests (select), documents (delete), selfies (delete),
    // verification_requests (anonymize), users (anonymize)
    expect(supabase.from).toHaveBeenCalledWith('verification_requests');
    expect(supabase.from).toHaveBeenCalledWith('documents');
    expect(supabase.from).toHaveBeenCalledWith('selfies');
    expect(supabase.from).toHaveBeenCalledWith('users');
  });

  it('runRetentionCleanup returns count of deleted records', async () => {
    (supabase.from as any).mockImplementation(() => makeChainableMock({
      data: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      error: null,
    }));

    const { DataRetentionService } = await import('../../services/dataRetention.js');
    const service = new DataRetentionService();

    // Stub deleteUserData to avoid cascading mock complexity
    vi.spyOn(service, 'deleteUserData').mockResolvedValue(undefined);

    const count = await service.runRetentionCleanup(90);
    expect(count).toBe(2);
  });

  it('deleteUserData cleans up expiry_alerts and reverification_schedules', async () => {
    const fromCalls: string[] = [];
    (supabase.from as any).mockImplementation((table: string) => {
      fromCalls.push(table);
      if (table === 'verification_requests' && fromCalls.filter(t => t === 'verification_requests').length === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'ver-1', documents: [], selfies: [] }],
            error: null,
          }),
        };
      }
      return makeChainableMock({ data: null, error: null });
    });

    const { DataRetentionService } = await import('../../services/dataRetention.js');
    const service = new DataRetentionService();
    await service.deleteUserData('user-1', 'gdpr-request');

    expect(fromCalls).toContain('expiry_alerts');
    expect(fromCalls).toContain('reverification_schedules');
  });

  it('runExpiryAlertCleanup deletes old sent alerts', async () => {
    (supabase.from as any).mockImplementation(() => makeChainableMock({
      data: null, error: null, count: 5,
    }));

    const { DataRetentionService } = await import('../../services/dataRetention.js');
    const service = new DataRetentionService();

    const count = await service.runExpiryAlertCleanup(180);
    expect(count).toBe(5);
    expect(supabase.from).toHaveBeenCalledWith('expiry_alerts');
  });

  it('runExpiryAlertCleanup returns 0 when nothing to clean', async () => {
    (supabase.from as any).mockImplementation(() => makeChainableMock({
      data: null, error: null, count: 0,
    }));

    const { DataRetentionService } = await import('../../services/dataRetention.js');
    const service = new DataRetentionService();

    const count = await service.runExpiryAlertCleanup(180);
    expect(count).toBe(0);
  });
});
