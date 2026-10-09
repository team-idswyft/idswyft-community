/**
 * Unit tests for DataRetentionService.
 *
 * Mocks the Supabase client to verify the GDPR erasure path covers the right
 * tables. Specifically asserts that `aml_screenings` is deleted alongside
 * other PII-bearing verification artifacts — closes audit finding from
 * 2026-04-25 production-readiness review.
 */

// Must mock database BEFORE importing the service.
vi.mock('../../config/database.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Stub StorageService since we don't exercise file deletion in these tests.
vi.mock('../storage.js', () => ({
  StorageService: class {
    async deleteFile(_path: string): Promise<void> { /* no-op */ }
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ABANDONED_CAPTURE_GRACE_MINUTES, DataRetentionService } from '../dataRetention.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Build a chainable query mock that resolves to { data, error } when awaited.
 * Tracks the chain of method calls so tests can assert which methods + args
 * were invoked.
 */
function chainable(resolveValue: any) {
  const calls: Array<{ method: string; args: any[] }> = [];
  const handler: any = {
    select: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'select', args }); return this; }),
    delete: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'delete', args }); return this; }),
    update: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'update', args }); return this; }),
    in: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'in', args }); return this; }),
    eq: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'eq', args }); return this; }),
    not: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'not', args }); return this; }),
    lt: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'lt', args }); return this; }),
    then: (resolve: any) => resolve(resolveValue),
    __calls: calls,
  };
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DataRetentionService.deleteUserData', () => {
  it('calls .from("aml_screenings").delete() with the user\'s verification IDs', async () => {
    const userId = 'user-abc';
    const verificationIds = ['v1', 'v2'];

    const fromMock = supabase.from as any as ReturnType<typeof vi.fn>;

    // Track each table that .from() is invoked with, plus the chain returned.
    const tableInvocations: Array<{ table: string; chain: ReturnType<typeof chainable> }> = [];

    fromMock.mockImplementation((table: string) => {
      let resolveValue: any;
      // First .from('verification_requests') returns the verification list (ids + nested files).
      if (table === 'verification_requests' && tableInvocations.filter(t => t.table === 'verification_requests').length === 0) {
        resolveValue = {
          data: verificationIds.map((id) => ({ id, documents: [], selfies: [] })),
          error: null,
        };
      } else {
        resolveValue = { data: null, error: null };
      }
      const chain = chainable(resolveValue);
      tableInvocations.push({ table, chain });
      return chain;
    });

    await new DataRetentionService().deleteUserData(userId, 'test');

    // The aml_screenings deletion must have been invoked exactly once.
    const amlInvocations = tableInvocations.filter((t) => t.table === 'aml_screenings');
    expect(amlInvocations).toHaveLength(1);

    // Verify the chain: .delete().in('verification_request_id', verificationIds)
    const amlChain = amlInvocations[0].chain;
    const callMethods = amlChain.__calls.map((c) => c.method);
    expect(callMethods).toContain('delete');
    expect(callMethods).toContain('in');

    const inCall = amlChain.__calls.find((c) => c.method === 'in');
    expect(inCall?.args[0]).toBe('verification_request_id');
    expect(inCall?.args[1]).toEqual(verificationIds);
  });

  it('does not call .from("aml_screenings") when the user has no verifications', async () => {
    const userId = 'user-with-no-verifications';
    const fromMock = supabase.from as any as ReturnType<typeof vi.fn>;

    const calls: string[] = [];
    fromMock.mockImplementation((table: string) => {
      calls.push(table);
      // Empty verification list short-circuits the per-id deletes.
      if (table === 'verification_requests' && calls.filter(t => t === 'verification_requests').length === 1) {
        return chainable({ data: [], error: null });
      }
      return chainable({ data: null, error: null });
    });

    await new DataRetentionService().deleteUserData(userId, 'test');
    expect(calls).not.toContain('aml_screenings');
  });
});

describe('DataRetentionService.runDemoCleanup', () => {
  it('calls .from("aml_screenings").delete() for stale demo verifications', async () => {
    const fromMock = supabase.from as any as ReturnType<typeof vi.fn>;

    const tableInvocations: Array<{ table: string; chain: ReturnType<typeof chainable> }> = [];

    fromMock.mockImplementation((table: string) => {
      let resolveValue: any;
      // Demo cleanup first lists stale verifications by id.
      if (table === 'verification_requests' && tableInvocations.filter(t => t.table === 'verification_requests').length === 0) {
        resolveValue = { data: [{ id: 'demo-v1' }, { id: 'demo-v2' }], error: null };
      } else if (table === 'documents' && tableInvocations.filter(t => t.table === 'documents').length === 0) {
        // First documents query is for file_paths
        resolveValue = { data: [], error: null };
      } else if (table === 'selfies' && tableInvocations.filter(t => t.table === 'selfies').length === 0) {
        resolveValue = { data: [], error: null };
      } else {
        resolveValue = { data: null, error: null };
      }
      const chain = chainable(resolveValue);
      tableInvocations.push({ table, chain });
      return chain;
    });

    await new DataRetentionService().runDemoCleanup(24);

    const amlInvocations = tableInvocations.filter((t) => t.table === 'aml_screenings');
    expect(amlInvocations).toHaveLength(1);

    const amlChain = amlInvocations[0].chain;
    const inCall = amlChain.__calls.find((c) => c.method === 'in');
    expect(inCall?.args[0]).toBe('verification_request_id');
    expect(inCall?.args[1]).toEqual(['demo-v1', 'demo-v2']);
  });
});

describe('DataRetentionService.runIdempotencyKeyCleanup', () => {
  it('deletes only rows whose expires_at is in the past', async () => {
    const fromMock = supabase.from as any as ReturnType<typeof vi.fn>;

    // First call: count(expired) → returns 7 to indicate work to do.
    // Second call: actual delete with same .lt('expires_at', now).
    let invocation = 0;
    const chains: any[] = [];
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe('idempotency_keys');
      invocation++;
      const chain = chainable(
        invocation === 1
          ? { count: 7, error: null }
          : { data: null, error: null },
      );
      chains.push(chain);
      return chain;
    });

    const deleted = await new DataRetentionService().runIdempotencyKeyCleanup();

    expect(deleted).toBe(7);
    expect(fromMock).toHaveBeenCalledTimes(2);

    // The delete chain (second invocation) must have called .delete()
    // and .lt('expires_at', <ISO string>). The cutoff must be a valid date.
    const deleteChain = chains[1];
    const methods = deleteChain.__calls.map((c: any) => c.method);
    expect(methods).toContain('delete');
    expect(methods).toContain('lt');

    const ltCall = deleteChain.__calls.find((c: any) => c.method === 'lt');
    expect(ltCall?.args[0]).toBe('expires_at');
    expect(typeof ltCall?.args[1]).toBe('string');
    expect(() => new Date(ltCall?.args[1])).not.toThrow();
  });

  it('returns 0 and does not run delete when count is zero', async () => {
    const fromMock = supabase.from as any as ReturnType<typeof vi.fn>;
    fromMock.mockImplementationOnce(() => chainable({ count: 0, error: null }));

    const deleted = await new DataRetentionService().runIdempotencyKeyCleanup();

    expect(deleted).toBe(0);
    // Only the count query ran — no delete.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

describe('DataRetentionService.runAbandonedCaptureCleanup', () => {
  /**
   * Routes supabase.from(table) to queued responses per table (default
   * { data: null, error: null }) and records every chain, per table, in call
   * order.
   */
  function routeTables(responses: Record<string, any[]>) {
    const fromMock = supabase.from as any as ReturnType<typeof vi.fn>;
    const chains: Record<string, any[]> = {};
    fromMock.mockImplementation((table: string) => {
      const queue = responses[table] ?? [];
      const chain = chainable(queue.length ? queue.shift() : { data: null, error: null });
      (chains[table] ??= []).push(chain);
      return chain;
    });
    return chains;
  }

  function deleteChains(chains: any[] = []) {
    return chains.filter((c) => c.__calls.some((call: any) => call.method === 'delete'));
  }

  function inArgs(chain: any) {
    return chain.__calls.find((c: any) => c.method === 'in')?.args;
  }

  it('only purges sessions that expired more than the grace period ago', async () => {
    const chains = routeTables({ verification_requests: [{ data: [], error: null }] });
    const before = Date.now();

    const purged = await new DataRetentionService().runAbandonedCaptureCleanup();

    expect(purged).toBe(0);
    const ltCall = chains.verification_requests[0].__calls.find((c: any) => c.method === 'lt');
    expect(ltCall?.args[0]).toBe('session_token_expires_at');
    const cutoff = new Date(ltCall?.args[1]).getTime();
    const graceMs = ABANDONED_CAPTURE_GRACE_MINUTES * 60 * 1000;
    expect(cutoff).toBeLessThanOrEqual(Date.now() - graceMs);
    expect(cutoff).toBeGreaterThanOrEqual(before - graceMs);
  });

  it('deletes every file and row when all file deletes succeed', async () => {
    const chains = routeTables({
      verification_requests: [{ data: [{ id: 'v-1' }, { id: 'v-2' }], error: null }],
      documents: [{
        data: [
          { id: 'd-1', verification_request_id: 'v-1', file_path: 'documents/v-1_a.jpg' },
          { id: 'd-2', verification_request_id: 'v-2', file_path: 'documents/v-2_a.jpg' },
        ],
        error: null,
      }],
      selfies: [{
        data: [{ id: 's-1', verification_request_id: 'v-1', file_path: 'selfies/v-1_a.jpg' }],
        error: null,
      }],
    });
    const service = new DataRetentionService();
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    (service as any).storageService.deleteFile = deleteFile;

    const purged = await service.runAbandonedCaptureCleanup();

    expect(purged).toBe(2);
    expect(deleteFile).toHaveBeenCalledTimes(3);
    for (const table of ['documents', 'selfies']) {
      const deletes = deleteChains(chains[table]);
      expect(deletes).toHaveLength(1);
      expect(inArgs(deletes[0])).toEqual(['verification_request_id', ['v-1', 'v-2']]);
    }
    const contextDeletes = deleteChains(chains.verification_contexts);
    expect(contextDeletes).toHaveLength(1);
    expect(inArgs(contextDeletes[0])).toEqual(['verification_id', ['v-1', 'v-2']]);
  });

  it('keeps the row and session state of a file that failed to delete, for the next run', async () => {
    const chains = routeTables({
      verification_requests: [{ data: [{ id: 'v-1' }, { id: 'v-2' }], error: null }],
      documents: [{
        data: [
          { id: 'd-1', verification_request_id: 'v-1', file_path: 'documents/v-1_front.jpg' },
          { id: 'd-2', verification_request_id: 'v-1', file_path: 'documents/v-1_back.jpg' },
          { id: 'd-3', verification_request_id: 'v-2', file_path: 'documents/v-2_front.jpg' },
        ],
        error: null,
      }],
      selfies: [{ data: [], error: null }],
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const service = new DataRetentionService();
    (service as any).storageService.deleteFile = vi.fn(async (path: string) => {
      if (path === 'documents/v-1_back.jpg') throw new Error('AccessDenied');
    });

    const purged = await service.runAbandonedCaptureCleanup();

    // v-2 is fully purged; v-1 is not.
    expect(purged).toBe(1);
    const documentDeletes = deleteChains(chains.documents);
    expect(documentDeletes.map(inArgs)).toEqual([
      ['verification_request_id', ['v-2']],
      // v-1's front file is gone, so its row goes; the failed back row stays.
      ['id', ['d-1']],
    ]);
    const contextDeletes = deleteChains(chains.verification_contexts);
    expect(contextDeletes.map(inArgs)).toEqual([['verification_id', ['v-2']]]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to delete file'),
      expect.objectContaining({
        verificationId: 'v-1',
        filePath: 'documents/v-1_back.jpg',
        error: 'AccessDenied',
      }),
    );
    warn.mockRestore();
  });

  it('deletes no rows at all when every file delete fails', async () => {
    const chains = routeTables({
      verification_requests: [{ data: [{ id: 'v-1' }], error: null }],
      documents: [{
        data: [{ id: 'd-1', verification_request_id: 'v-1', file_path: 'documents/v-1_a.jpg' }],
        error: null,
      }],
      selfies: [{ data: [], error: null }],
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const service = new DataRetentionService();
    (service as any).storageService.deleteFile = vi.fn().mockRejectedValue(new Error('timeout'));

    const purged = await service.runAbandonedCaptureCleanup();

    expect(purged).toBe(0);
    expect(deleteChains(chains.documents)).toHaveLength(0);
    expect(deleteChains(chains.selfies)).toHaveLength(0);
    expect(chains.verification_contexts).toBeUndefined();
    warn.mockRestore();
  });
});
