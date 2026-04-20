/**
 * Unit tests for the velocity analysis service.
 *
 * Tests verify threshold logic, flag assignment, score computation,
 * and step timing analysis. Supabase queries are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock supabase before importing the service ────────────────────
const mockFrom = vi.fn();

vi.mock('../../config/database.js', () => ({
  supabase: { from: mockFrom },
}));

// Must import AFTER vi.mock
const { analyzeVelocity } = await import('../velocityAnalysis.js');

/**
 * Helper to configure mock supabase count queries.
 * The velocity service makes 3 sequential count queries:
 *   1. IP in 1 hour
 *   2. IP in 24 hours
 *   3. User in 24 hours
 */
function mockCountQueries(ipCount1h: number, ipCount24h: number, userCount24h: number) {
  let callIndex = 0;

  mockFrom.mockImplementation(() => {
    const chainResult = { count: 0, error: null };
    const currentIdx = callIndex++;

    if (currentIdx === 0) chainResult.count = ipCount1h;
    else if (currentIdx === 1) chainResult.count = ipCount24h;
    else chainResult.count = userCount24h;

    // Build a chainable mock — each method returns the chain, last one resolves
    const chain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'gte'];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    // Override gte to resolve with the count (gte is the terminal call)
    chain.gte = vi.fn().mockResolvedValue(chainResult);

    return chain;
  });
}

describe('analyzeVelocity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns score 0 with no flags when no prior verifications exist', async () => {
    mockCountQueries(0, 0, 0);

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', null);

    expect(result.score).toBe(0);
    expect(result.flags).toEqual([]);
    expect(result.ip_verifications_1h).toBe(0);
    expect(result.ip_verifications_24h).toBe(0);
    expect(result.user_verifications_24h).toBe(0);
  });

  it('returns rapid_ip_reuse flag when >5 same-IP verifications in 1 hour', async () => {
    mockCountQueries(6, 6, 0);

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', null);

    expect(result.flags).toContain('rapid_ip_reuse');
    expect(result.ip_verifications_1h).toBe(6);
    expect(result.score).toBe(70);
  });

  it('returns high_user_frequency flag when >3 same-user verifications in 24 hours', async () => {
    mockCountQueries(0, 0, 4);

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', null);

    expect(result.flags).toContain('high_user_frequency');
    expect(result.user_verifications_24h).toBe(4);
    expect(result.score).toBe(40);
  });

  it('returns bot_like_timing flag when step duration < 2 seconds', async () => {
    mockCountQueries(0, 0, 0);

    const now = Date.now();
    const stepTimestamps = {
      init: new Date(now).toISOString(),
      front: new Date(now + 500).toISOString(),  // 500ms — bot-like
      back: new Date(now + 3000).toISOString(),
    };

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', stepTimestamps);

    expect(result.flags).toContain('bot_like_timing');
    expect(result.fastest_step_ms).toBe(500);
    expect(result.score).toBe(80);
  });

  it('returns burst_activity flag when >10 same-IP verifications in 24 hours', async () => {
    mockCountQueries(3, 11, 0);

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', null);

    expect(result.flags).toContain('burst_activity');
    expect(result.flags).not.toContain('rapid_ip_reuse'); // 3 is under threshold
    expect(result.ip_verifications_24h).toBe(11);
    expect(result.score).toBe(50);
  });

  it('score is the highest individual flag score (not cumulative)', async () => {
    mockCountQueries(6, 11, 4); // rapid_ip_reuse(70) + burst_activity(50) + high_user_frequency(40)

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', null);

    expect(result.flags).toContain('rapid_ip_reuse');
    expect(result.flags).toContain('burst_activity');
    expect(result.flags).toContain('high_user_frequency');
    // Score should be max (rapid_ip_reuse = 70), not sum
    expect(result.score).toBe(70);
  });

  it('skips IP queries when IP is null', async () => {
    mockCountQueries(0, 0, 0);

    const result = await analyzeVelocity('dev-1', 'user-1', null, 'vr-1', null);

    // IP counts stay 0 because queries were skipped
    expect(result.ip_verifications_1h).toBe(0);
    expect(result.ip_verifications_24h).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it('computes avg_step_duration_ms correctly', async () => {
    mockCountQueries(0, 0, 0);

    const now = Date.now();
    const stepTimestamps = {
      init: new Date(now).toISOString(),
      front: new Date(now + 10000).toISOString(),    // 10s from init
      back: new Date(now + 25000).toISOString(),     // 15s from front
      live: new Date(now + 40000).toISOString(),     // 15s from back
    };

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', stepTimestamps);

    // Durations: 10000, 15000, 15000 → avg ~13333
    expect(result.avg_step_duration_ms).toBe(Math.round((10000 + 15000 + 15000) / 3));
    expect(result.fastest_step_ms).toBe(10000);
    expect(result.flags).not.toContain('bot_like_timing'); // all >2s
  });

  it('returns null timing when fewer than 2 step timestamps', async () => {
    mockCountQueries(0, 0, 0);

    const result = await analyzeVelocity('dev-1', 'user-1', '1.2.3.4', 'vr-1', { init: new Date().toISOString() });

    expect(result.avg_step_duration_ms).toBeNull();
    expect(result.fastest_step_ms).toBeNull();
  });
});
