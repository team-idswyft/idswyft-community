/**
 * Unit tests for session-token expiry on terminal verification states (GHSA-rrm9).
 *
 * A hosted-page session token must not outlive the verification it was minted
 * for. Reaching a terminal status (verified / failed / manual_review) must set
 * session_token_expires_at in the same write. Mocks Supabase and asserts the
 * update payload.
 */

// Must mock database BEFORE importing the service.
vi.mock('../../config/database.js', () => ({
  supabase: { from: vi.fn() },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationService } from '../verification.js';
import { supabase } from '../../config/database.js';

/** Chainable Supabase mock that records update() args and resolves at single(). */
function chainable(resolveValue: any, calls: Array<{ method: string; args: any[] }>) {
  const handler: any = {
    update: vi.fn(function (this: any, ...args: any[]) { calls.push({ method: 'update', args }); return this; }),
    eq: vi.fn(function (this: any) { return this; }),
    select: vi.fn(function (this: any) { return this; }),
    single: vi.fn(function () { return Promise.resolve(resolveValue); }),
  };
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function mockUpdateReturning(row: any) {
  const calls: Array<{ method: string; args: any[] }> = [];
  (supabase.from as any as ReturnType<typeof vi.fn>).mockReturnValue(
    chainable({ data: row, error: null }, calls),
  );
  return calls;
}

describe('VerificationService session-token expiry (GHSA-rrm9)', () => {
  it('sets session_token_expires_at when updateVerificationRequest moves to a terminal status', async () => {
    for (const status of ['verified', 'failed', 'manual_review']) {
      const calls = mockUpdateReturning({ id: 'v1', status });
      await new VerificationService().updateVerificationRequest('v1', { status } as any);
      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toHaveProperty('session_token_expires_at');
      expect(typeof update?.args[0].session_token_expires_at).toBe('string');
    }
  });

  it('does NOT touch session_token_expires_at on a non-terminal update', async () => {
    const calls = mockUpdateReturning({ id: 'v1', status: 'processing' });
    await new VerificationService().updateVerificationRequest('v1', { status: 'processing' } as any);
    const update = calls.find((c) => c.method === 'update');
    expect(update?.args[0]).not.toHaveProperty('session_token_expires_at');
  });

  it('expires the token when a reviewer approves (terminal, bypasses updateVerificationRequest)', async () => {
    const calls = mockUpdateReturning({ id: 'v1', status: 'verified' });
    await new VerificationService().approveVerification('v1', 'reviewer-1');
    const update = calls.find((c) => c.method === 'update');
    expect(update?.args[0].status).toBe('verified');
    expect(update?.args[0]).toHaveProperty('session_token_expires_at');
  });

  it('expires the token when a reviewer rejects', async () => {
    const calls = mockUpdateReturning({ id: 'v1', status: 'failed' });
    await new VerificationService().rejectVerification('v1', 'reviewer-1', 'blurry');
    const update = calls.find((c) => c.method === 'update');
    expect(update?.args[0].status).toBe('failed');
    expect(update?.args[0]).toHaveProperty('session_token_expires_at');
  });
});
