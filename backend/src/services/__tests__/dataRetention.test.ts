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
import { DataRetentionService } from '../dataRetention.js';
import { supabase } from '../../config/database.js';

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
