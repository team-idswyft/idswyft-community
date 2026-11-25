import { describe, it, expect, vi } from 'vitest';
import { AuthorizationError, ValidationError } from '../../middleware/errorHandler.js';

// --- AuthorizationError class tests ---
describe('AuthorizationError', () => {
  it('is exported and is a class', () => {
    expect(typeof AuthorizationError).toBe('function');
  });

  it('produces a 403 status code', () => {
    const err = new AuthorizationError();
    expect((err as any).statusCode).toBe(403);
  });

  it('has default message', () => {
    const err = new AuthorizationError();
    expect(err.message).toBe('Not authorized to access this resource');
  });

  it('accepts a custom message', () => {
    const err = new AuthorizationError('custom');
    expect(err.message).toBe('custom');
  });
});

// --- IDOR ownership protection: atomic query pattern ---
describe('IDOR ownership protection — getVerificationRequestForDeveloper pattern', () => {
  function makeVerification(developerId: string) {
    return { id: 'ver-1', developer_id: developerId, user_id: 'user-1', status: 'pending' as const };
  }

  // Simulates the route logic: call atomic query, throw ValidationError if null
  async function simulateOwnershipCheck(
    queryResult: ReturnType<typeof makeVerification> | null
  ) {
    if (!queryResult) {
      throw new ValidationError('Verification request not found', 'verification_id', 'ver-1');
    }
    return queryResult;
  }

  it('returns the verification when the developer owns it', async () => {
    const ver = makeVerification('dev-A');
    const result = await simulateOwnershipCheck(ver);
    expect(result.id).toBe('ver-1');
  });

  it('throws ValidationError when the atomic query returns null (not found or wrong developer)', async () => {
    await expect(simulateOwnershipCheck(null)).rejects.toBeInstanceOf(ValidationError);
  });

  it('atomic query mock returns null when developer_id does not match — routes receive null', async () => {
    const mockService = {
      getVerificationRequestForDeveloper: vi.fn(
        async (id: string, devId: string) =>
          devId === 'dev-A' ? makeVerification('dev-A') : null
      ),
    };

    const resultOwned = await mockService.getVerificationRequestForDeveloper('ver-1', 'dev-A');
    expect(resultOwned).not.toBeNull();

    const resultUnowned = await mockService.getVerificationRequestForDeveloper('ver-1', 'dev-B');
    expect(resultUnowned).toBeNull();
  });

  it('ValidationError has correct statusCode (404-like behavior — no information leak)', () => {
    const err = new ValidationError('Verification request not found', 'verification_id', 'ver-1');
    // ValidationError maps to 400 via errorHandler — not a 403 that would confirm resource existence
    expect((err as any).statusCode).toBe(400);
  });
});

// --- Session/handoff token binding to a single verification (GHSA-hvgx, GHSA-6fwm) ---
describe('session-token binding guard', () => {
  // Mirrors the guard in requireOwnedVerification and the one now added to
  // addressVerification.ts: a bound session token may only act on its own
  // verification; absence of a binding falls back to the developer-only check.
  function bindingAllows(sessionVerificationId: string | undefined, verificationId: string): boolean {
    return !(sessionVerificationId && sessionVerificationId !== verificationId);
  }

  it('allows access when the token is bound to the same verification', () => {
    expect(bindingAllows('ver-1', 'ver-1')).toBe(true);
  });

  it('denies access when a bound token targets a different verification (IDOR)', () => {
    expect(bindingAllows('ver-1', 'ver-2')).toBe(false);
  });

  it('falls back to the developer-only check when no binding is present (API-key / legacy handoff)', () => {
    expect(bindingAllows(undefined, 'ver-2')).toBe(true);
  });

  // GHSA-6fwm: a handoff minted from a session token now carries that session's
  // verification id (handoff.ts /create → auth.ts authenticateHandoffToken),
  // so the same guard rejects cross-verification use of a handoff token.
  it('handoff minted from a session token binds to the session verification', () => {
    const sessionVerification = { id: 'ver-1' };
    const handoffRow: { verification_id?: string } = {};
    handoffRow.verification_id = sessionVerification.id;       // /create session branch
    const sessionVerificationId = handoffRow.verification_id;  // authenticateHandoffToken
    expect(bindingAllows(sessionVerificationId, 'ver-2')).toBe(false);
    expect(bindingAllows(sessionVerificationId, 'ver-1')).toBe(true);
  });
});

// --- Handoff token lifetime vs its bound verification (GHSA-rrm9, finding 2) ---
describe('handoff token lifetime guard', () => {
  // Mirrors authenticateHandoffToken: a bound handoff token is rejected once its
  // verification is terminal or its session token has expired — except /restart,
  // which an applicant uses to retry after a failed verification.
  function handoffAllowed(boundStatus: string, tokenExpiresAt: string | null, path: string): boolean {
    if (path.endsWith('/restart')) return true;
    const TERMINAL = ['verified', 'failed', 'manual_review'];
    const isTerminal = TERMINAL.includes(boundStatus);
    const tokenExpired = !!tokenExpiresAt && new Date(tokenExpiresAt) < new Date();
    return !(isTerminal || tokenExpired);
  }
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 60_000).toISOString();

  it('allows an active (non-terminal, unexpired) verification', () => {
    expect(handoffAllowed('processing', future, '/api/v2/verify/x/status')).toBe(true);
  });

  it('rejects once the verification is terminal', () => {
    expect(handoffAllowed('verified', future, '/api/v2/verify/x/status')).toBe(false);
    expect(handoffAllowed('manual_review', future, '/api/v2/verify/x/front-document')).toBe(false);
  });

  it('rejects once the session token has expired', () => {
    expect(handoffAllowed('processing', past, '/api/v2/verify/x/status')).toBe(false);
  });

  it('still allows /restart after a failed verification (retry flow preserved)', () => {
    expect(handoffAllowed('failed', past, '/api/v2/verify/x/restart')).toBe(true);
  });
});
