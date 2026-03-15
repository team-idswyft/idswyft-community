/**
 * Unit tests for the batch verification service.
 */

vi.mock('../../config/database.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBatch,
  getBatchStatus,
  getBatchResults,
  cancelBatch,
  listBatches,
} from '../batchVerification.js';
import { supabase } from '../../config/database.js';

/** Chainable Supabase mock */
function mockChain(finalResult: any) {
  const chain: any = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  };
  chain.then = (resolve: any) => resolve(finalResult);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createBatch', () => {
  it('creates a batch job and items', async () => {
    const mockJob = {
      id: 'batch-1',
      developer_id: 'dev-1',
      status: 'pending',
      total_items: 2,
      processed_items: 0,
      succeeded_items: 0,
      failed_items: 0,
      created_at: '2025-01-01T00:00:00Z',
      completed_at: null,
    };

    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // batch_jobs insert
        return mockChain({ data: mockJob, error: null });
      }
      // batch_items insert
      return mockChain({ error: null });
    });

    const result = await createBatch('dev-1', [
      { user_id: 'user-1' },
      { user_id: 'user-2' },
    ]);

    expect(result.id).toBe('batch-1');
    expect(result.total_items).toBe(2);
    expect(result.status).toBe('pending');
  });

  it('rejects empty items array', async () => {
    await expect(createBatch('dev-1', [])).rejects.toThrow('at least one item');
  });

  it('rejects oversized batches', async () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ user_id: `user-${i}` }));
    await expect(createBatch('dev-1', items)).rejects.toThrow('cannot exceed');
  });

  it('rejects items without user_id', async () => {
    await expect(createBatch('dev-1', [{ user_id: '' }])).rejects.toThrow('missing required field');
  });
});

describe('getBatchStatus', () => {
  it('returns batch job when found', async () => {
    const mockJob = {
      id: 'batch-1',
      developer_id: 'dev-1',
      status: 'processing',
      total_items: 5,
      processed_items: 3,
      succeeded_items: 2,
      failed_items: 1,
    };

    (supabase.from as any).mockReturnValue(mockChain({ data: mockJob, error: null }));

    const result = await getBatchStatus('batch-1', 'dev-1');
    expect(result).toMatchObject({ id: 'batch-1', status: 'processing' });
  });

  it('returns null when not found', async () => {
    (supabase.from as any).mockReturnValue(mockChain({ data: null, error: { message: 'not found' } }));

    const result = await getBatchStatus('nonexistent', 'dev-1');
    expect(result).toBeNull();
  });
});

describe('getBatchResults', () => {
  it('returns mapped results for a batch', async () => {
    const mockJob = { id: 'batch-1', developer_id: 'dev-1', status: 'completed' };
    const mockItems = [
      { id: 'item-1', user_id: 'user-1', status: 'completed', verification_id: 'v-1', error: null },
      { id: 'item-2', user_id: 'user-2', status: 'failed', verification_id: null, error: 'timeout' },
    ];

    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockChain({ data: mockJob, error: null });
      return mockChain({ data: mockItems, error: null });
    });

    const results = await getBatchResults('batch-1', 'dev-1');
    expect(results.length).toBe(2);
    expect(results[0]).toMatchObject({ item_id: 'item-1', status: 'completed', verification_id: 'v-1' });
    expect(results[1]).toMatchObject({ item_id: 'item-2', status: 'failed', error: 'timeout' });
  });

  it('returns empty array for unauthorized batch', async () => {
    (supabase.from as any).mockReturnValue(mockChain({ data: null, error: { message: 'not found' } }));

    const results = await getBatchResults('batch-1', 'wrong-dev');
    expect(results).toEqual([]);
  });
});

describe('cancelBatch', () => {
  it('cancels a pending batch', async () => {
    const mockJob = { id: 'batch-1', developer_id: 'dev-1', status: 'pending' };

    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockChain({ data: mockJob, error: null });
      return mockChain({ data: null, error: null });
    });

    const result = await cancelBatch('batch-1', 'dev-1');
    expect(result).toBe(true);
  });

  it('returns false for already completed batch', async () => {
    const mockJob = { id: 'batch-1', developer_id: 'dev-1', status: 'completed' };

    (supabase.from as any).mockReturnValue(mockChain({ data: mockJob, error: null }));

    const result = await cancelBatch('batch-1', 'dev-1');
    expect(result).toBe(false);
  });

  it('returns false for nonexistent batch', async () => {
    (supabase.from as any).mockReturnValue(mockChain({ data: null, error: { message: 'not found' } }));

    const result = await cancelBatch('nonexistent', 'dev-1');
    expect(result).toBe(false);
  });
});

describe('listBatches', () => {
  it('returns paginated batch list', async () => {
    const mockJobs = [
      { id: 'b-1', status: 'completed' },
      { id: 'b-2', status: 'processing' },
    ];

    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockChain({ data: mockJobs, error: null });
      return mockChain({ count: 5, error: null });
    });

    const result = await listBatches('dev-1', 1, 10);
    expect(result.jobs.length).toBe(2);
    expect(result.total).toBe(5);
  });
});
