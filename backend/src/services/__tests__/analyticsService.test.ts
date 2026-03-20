/**
 * Unit tests for the analytics service.
 *
 * Mocks the Supabase client to verify query construction and
 * data transformation logic in analytics functions.
 */

// Must mock database before importing the service
vi.mock('../../config/database.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getConversionFunnel,
  getGateRejectionBreakdown,
  getFraudPatterns,
  getRiskDistribution,
} from '../analyticsService.js';
import { supabase } from '../../config/database.js';

/** Helper to create a chainable Supabase query mock */
function mockQuery(data: any[], error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  // Terminal: await returns { data, error }
  chain.then = (resolve: any) => resolve({ data, error });
  return chain;
}

function mockCountQuery(count: number | null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  chain.then = (resolve: any) => resolve({ count, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getConversionFunnel', () => {
  it('returns funnel steps based on session state context', async () => {
    // First call: verification_requests (ids)
    const requests = [
      { id: 'v1' }, { id: 'v2' }, { id: 'v3' }, { id: 'v4' },
    ];
    // Second call: verification_contexts (session states)
    const contexts = [
      { verification_id: 'v1', context: JSON.stringify({ front_extraction: {}, back_extraction: {}, face_match: {}, current_step: 5 }) },
      { verification_id: 'v2', context: JSON.stringify({ front_extraction: {}, back_extraction: {} }) },
      { verification_id: 'v3', context: JSON.stringify({ front_extraction: {} }) },
      { verification_id: 'v4', context: JSON.stringify({}) }, // only initialized
    ];

    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery(requests);
      return mockQuery(contexts);
    });

    const result = await getConversionFunnel({
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(result.length).toBe(5);
    expect(result[0]).toMatchObject({ step: 'initialized', count: 4, percentage: 100 });
    expect(result[1]).toMatchObject({ step: 'front_uploaded', count: 3 }); // v1, v2, v3
    expect(result[2]).toMatchObject({ step: 'back_uploaded', count: 2 }); // v1, v2
    expect(result[3]).toMatchObject({ step: 'live_captured', count: 1 }); // v1
    expect(result[4]).toMatchObject({ step: 'completed', count: 1 }); // v1
  });

  it('returns empty array on error', async () => {
    (supabase.from as any).mockReturnValue(mockQuery(null, { message: 'db error' }));
    const result = await getConversionFunnel();
    expect(result).toEqual([]);
  });

  it('returns empty array when no data', async () => {
    (supabase.from as any).mockReturnValue(mockQuery([]));
    const result = await getConversionFunnel();
    expect(result).toEqual([]);
  });
});

describe('getGateRejectionBreakdown', () => {
  it('counts rejection reasons and sorts by frequency', async () => {
    const rows = [
      { context: JSON.stringify({ rejection_reason: 'FACE_MISMATCH' }) },
      { context: JSON.stringify({ rejection_reason: 'FACE_MISMATCH' }) },
      { context: JSON.stringify({ rejection_reason: 'OCR_LOW_CONFIDENCE' }) },
      { context: JSON.stringify({ rejection_reason: 'AML_MATCH_FOUND' }) },
      { context: JSON.stringify({}) }, // no rejection
    ];

    (supabase.from as any).mockReturnValue(mockQuery(rows));

    const result = await getGateRejectionBreakdown({
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({ reason: 'FACE_MISMATCH', count: 2 });
    expect(result[1].count).toBe(1);
    // percentages sum to ~100
    const totalPct = result.reduce((sum, r) => sum + r.percentage, 0);
    expect(totalPct).toBeGreaterThanOrEqual(98); // rounding tolerance
  });

  it('returns empty array when no rejections found', async () => {
    (supabase.from as any).mockReturnValue(mockQuery([{ context: '{}' }]));
    const result = await getGateRejectionBreakdown();
    expect(result).toEqual([]);
  });

  it('handles already-parsed context objects', async () => {
    const rows = [
      { context: { rejection_reason: 'LIVENESS_FAIL' } },
    ];
    (supabase.from as any).mockReturnValue(mockQuery(rows));

    const result = await getGateRejectionBreakdown();
    expect(result.length).toBe(1);
    expect(result[0].reason).toBe('LIVENESS_FAIL');
  });
});

describe('getFraudPatterns', () => {
  it('detects repeated failures pattern', async () => {
    const failedRows = [
      { user_id: 'user-1' },
      { user_id: 'user-1' },
      { user_id: 'user-1' }, // 3 failures
      { user_id: 'user-2' },
      { user_id: 'user-2' },
      { user_id: 'user-2' },
      { user_id: 'user-2' }, // 4 failures
      { user_id: 'user-3' }, // only 1
    ];

    // First call (failed verifications), second call (velocity)
    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return mockQuery(failedRows);
      }
      return mockCountQuery(10); // low velocity
    });

    const result = await getFraudPatterns({
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    const repeatedPattern = result.find(p => p.pattern === 'repeated_failures');
    expect(repeatedPattern).toBeDefined();
    expect(repeatedPattern!.count).toBe(2); // user-1 and user-2
  });

  it('detects high velocity pattern', async () => {
    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery([]); // no failures
      return mockCountQuery(150); // high velocity
    });

    const result = await getFraudPatterns();
    const velocityPattern = result.find(p => p.pattern === 'high_velocity');
    expect(velocityPattern).toBeDefined();
    expect(velocityPattern!.count).toBe(150);
  });

  it('returns empty when no patterns detected', async () => {
    let callCount = 0;
    (supabase.from as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery([]); // no failures
      return mockCountQuery(5); // low velocity
    });

    const result = await getFraudPatterns();
    expect(result).toEqual([]);
  });
});

describe('getRiskDistribution', () => {
  it('groups and counts risk levels', async () => {
    const rows = [
      { risk_level: 'low' },
      { risk_level: 'low' },
      { risk_level: 'low' },
      { risk_level: 'medium' },
      { risk_level: 'high' },
    ];

    (supabase.from as any).mockReturnValue(mockQuery(rows));

    const result = await getRiskDistribution({
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(result.length).toBe(3); // low, medium, high (critical = 0, filtered out)
    const low = result.find(r => r.level === 'low');
    expect(low).toMatchObject({ count: 3, percentage: 60 });
  });

  it('returns empty on error', async () => {
    (supabase.from as any).mockReturnValue(mockQuery(null, { message: 'oops' }));
    const result = await getRiskDistribution();
    expect(result).toEqual([]);
  });
});
