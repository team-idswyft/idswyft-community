/**
 * Verifies getVerificationRequestsForAdmin / getVerificationStats apply an
 * api_key_id filter when apiKeyId is provided (operator scope) and omit it when
 * absent, and that approve/reject write role-neutral attribution + reviewed_by.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({
  filters: [] as Array<[string, any]>,
  invocations: [] as Array<Array<[string, any]>>,
  updatePayloads: [] as any[],
}));

vi.mock('@/config/database.js', () => {
  const chain = () => {
    const invFilters: Array<[string, any]> = [];
    calls.invocations.push(invFilters);
    const obj: any = {
      select: () => obj,
      update: (payload: any) => { calls.updatePayloads.push(payload); return obj; },
      eq: (c: string, v: any) => { calls.filters.push([c, v]); invFilters.push([c, v]); return obj; },
      in: () => obj, gte: () => obj, lte: () => obj, order: () => obj,
      range: () => Promise.resolve({ data: [], error: null, count: 0 }),
      limit: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({ data: { id: 'v1', status: 'verified', api_key_id: 'key-1' }, error: null }),
    };
    return obj;
  };
  return { supabase: { from: () => chain() }, connectDB: vi.fn() };
});
vi.mock('@/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { VerificationService } from '../verification.js';
const svc = new VerificationService();

beforeEach(() => { calls.filters = []; calls.invocations = []; calls.updatePayloads = []; });

describe('getVerificationRequestsForAdmin api_key_id scoping', () => {
  it('applies api_key_id filter when apiKeyId provided', async () => {
    await svc.getVerificationRequestsForAdmin({ developerId: 'dev-1', apiKeyId: 'key-1' } as any);
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
    // Prove BOTH the data query and the count query are scoped — not just one of them.
    expect(
      calls.invocations.filter(inv => inv.some(([c, v]) => c === 'api_key_id' && v === 'key-1')).length
    ).toBe(2);
  });
  it('omits api_key_id filter when apiKeyId absent', async () => {
    await svc.getVerificationRequestsForAdmin({ developerId: 'dev-1' } as any);
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });
});

describe('getVerificationStats api_key_id scoping', () => {
  it('applies api_key_id filter when provided', async () => {
    await svc.getVerificationStats('dev-1', 'key-1');
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
  });
  it('omits api_key_id filter when not provided', async () => {
    await svc.getVerificationStats('dev-1');
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });
});

describe('approve/reject attribution', () => {
  it('approveVerification writes reviewed_by and role-neutral reason', async () => {
    await svc.approveVerification('v1', 'op@example.com');
    const payload = calls.updatePayloads.at(-1);
    expect(payload.reviewed_by).toBe('op@example.com');
    expect(payload.status).toBe('verified');
    expect(payload.manual_review_reason).toBe('Manually approved by op@example.com');
    expect(payload.manual_review_reason).not.toContain('admin');
    expect(payload.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('rejectVerification writes reviewed_by and role-neutral reason', async () => {
    await svc.rejectVerification('v1', 'op@example.com', 'blurry');
    const payload = calls.updatePayloads.at(-1);
    expect(payload.reviewed_by).toBe('op@example.com');
    expect(payload.status).toBe('failed');
    expect(payload.manual_review_reason).toBe('Manually rejected by op@example.com: blurry');
    expect(payload.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
