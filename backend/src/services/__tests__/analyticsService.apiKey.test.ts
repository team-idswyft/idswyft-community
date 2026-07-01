/**
 * Verifies the dashboard analytics functions apply an api_key_id filter when
 * apiKeyId is provided (operator scope), and omit it when null/absent (developer).
 * We capture the eq() filter calls on a chainable mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({ filters: [] as Array<[string, any]> }));

vi.mock('@/config/database.js', () => {
  const chain = () => {
    const obj: any = {
      select: () => obj,
      eq: (c: string, v: any) => { calls.filters.push([c, v]); return obj; },
      in: () => obj,
      gte: () => obj,
      lte: () => obj,
      limit: () => Promise.resolve({ data: [], error: null }),
    };
    return obj;
  };
  return { supabase: { from: () => chain() }, connectDB: vi.fn() };
});

import {
  getDailyVerificationVolume,
  getConversionFunnel,
  getGateRejectionBreakdown,
  getDailyResponseTimes,
  getDailyWebhookDeliveries,
} from '../analyticsService.js';

const period = { start_date: '2026-06-01T00:00:00Z', end_date: '2026-06-08T00:00:00Z' };

beforeEach(() => { calls.filters = []; });

describe('analyticsService apiKeyId scoping', () => {
  it('getDailyVerificationVolume filters by api_key_id when provided', async () => {
    await getDailyVerificationVolume(period, 'dev-1', 'key-1');
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
  });

  it('getDailyVerificationVolume omits api_key_id when not provided', async () => {
    await getDailyVerificationVolume(period, 'dev-1');
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });

  it('getDailyResponseTimes filters api_activity_logs by api_key_id', async () => {
    await getDailyResponseTimes(period, 'dev-1', 'key-1');
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
  });

  it('getDailyResponseTimes omits api_key_id when not provided', async () => {
    await getDailyResponseTimes(period, 'dev-1');
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });

  it('getConversionFunnel filters by api_key_id', async () => {
    await getConversionFunnel(period, 'dev-1', 'key-1');
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
  });

  it('getConversionFunnel omits api_key_id when not provided', async () => {
    await getConversionFunnel(period, 'dev-1');
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });

  it('getGateRejectionBreakdown filters by api_key_id', async () => {
    await getGateRejectionBreakdown(period, 'dev-1', 'key-1');
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
  });

  it('getGateRejectionBreakdown omits api_key_id when not provided', async () => {
    await getGateRejectionBreakdown(period, 'dev-1');
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });

  it('getDailyWebhookDeliveries filters webhooks by api_key_id', async () => {
    await getDailyWebhookDeliveries(period, 'dev-1', 'key-1');
    expect(calls.filters).toContainEqual(['api_key_id', 'key-1']);
  });

  it('getDailyWebhookDeliveries omits api_key_id when not provided', async () => {
    await getDailyWebhookDeliveries(period, 'dev-1');
    expect(calls.filters).toContainEqual(['developer_id', 'dev-1']);
    expect(calls.filters.find(([c]) => c === 'api_key_id')).toBeUndefined();
  });
});
