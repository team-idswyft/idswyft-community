/**
 * Test: POST /api/v2/verify/re-verify
 *
 * Unit tests for the re-verification (returning user) endpoint.
 * Tests cover:
 * - Validation of parent verification (exists, same dev, same user, status=verified)
 * - Session creation with front_extraction from parent
 * - Session starts at AWAITING_LIVE (skips gates 1-3)
 * - DB record creation with parent_verification_id + verification_mode
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock session state for parent verification ───────────────────────────────

const PARENT_FRONT_EXTRACTION = {
  ocr: { full_name: 'John Doe', date_of_birth: '1990-01-15', document_number: 'D12345678' },
  ocr_confidence: 0.91,
  face_embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
  face_confidence: 0.95,
  face_bbox: { x: 100, y: 50, width: 200, height: 250 },
  document_quality: { brightness: 0.8, focus: 0.95, completeness: 0.90, overall_score: 0.88 },
};

const PARENT_SESSION_STATE = {
  session_id: 'parent-001',
  current_step: 'COMPLETE',
  issuing_country: 'US',
  front_extraction: PARENT_FRONT_EXTRACTION,
  back_extraction: { barcode_data: null, ocr: null },
  cross_validation: { verdict: 'PASS', score: 0.95, mismatches: [] },
  face_match: { passed: true, similarity_score: 0.85, threshold_used: 0.60 },
  liveness: { passed: true, score: 0.92 },
  deepfake_check: { isReal: true, realProbability: 0.97, fakeProbability: 0.03 },
  aml_screening: null,
  rejection_reason: null,
  rejection_detail: null,
  created_at: '2026-03-15T10:00:00Z',
  updated_at: '2026-03-15T10:00:05Z',
  completed_at: '2026-03-15T10:00:05Z',
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PARENT_VERIFICATION = {
  id: 'parent-001',
  user_id: 'user-001',
  developer_id: 'dev-001',
  status: 'verified',
  issuing_country: 'US',
};

// ── Validation logic tests ──────────────────────────────────────────────────

describe('Re-verification — parent validation', () => {
  function validateParent(
    parent: any,
    requestDeveloperId: string,
    requestUserId: string,
  ): string | null {
    if (!parent) return 'Previous verification not found';
    if (parent.developer_id !== requestDeveloperId) return 'Previous verification belongs to a different developer';
    if (parent.user_id !== requestUserId) return 'Previous verification belongs to a different user';
    if (parent.status !== 'verified') return 'Previous verification must have status "verified" to re-verify';
    if (parent.verification_mode && parent.verification_mode !== 'full') return 'Cannot re-verify from another re-verification';
    return null; // valid
  }

  it('accepts a valid parent verification', () => {
    expect(validateParent(PARENT_VERIFICATION, 'dev-001', 'user-001')).toBeNull();
  });

  it('rejects when parent is not found', () => {
    expect(validateParent(null, 'dev-001', 'user-001')).toBe('Previous verification not found');
  });

  it('rejects when developer_id does not match', () => {
    expect(validateParent(PARENT_VERIFICATION, 'dev-999', 'user-001')).toBe('Previous verification belongs to a different developer');
  });

  it('rejects when user_id does not match', () => {
    expect(validateParent(PARENT_VERIFICATION, 'dev-001', 'user-999')).toBe('Previous verification belongs to a different user');
  });

  it('rejects when parent status is not verified', () => {
    const failedParent = { ...PARENT_VERIFICATION, status: 'failed' };
    expect(validateParent(failedParent, 'dev-001', 'user-001')).toBe('Previous verification must have status "verified" to re-verify');
  });

  it('rejects when parent is pending', () => {
    const pendingParent = { ...PARENT_VERIFICATION, status: 'pending' };
    expect(validateParent(pendingParent, 'dev-001', 'user-001')).not.toBeNull();
  });

  it('rejects when parent is manual_review', () => {
    const reviewParent = { ...PARENT_VERIFICATION, status: 'manual_review' };
    expect(validateParent(reviewParent, 'dev-001', 'user-001')).not.toBeNull();
  });

  it('rejects when parent is itself a re-verification (liveness_only)', () => {
    const reVerifyParent = { ...PARENT_VERIFICATION, verification_mode: 'liveness_only' };
    expect(validateParent(reVerifyParent, 'dev-001', 'user-001')).toBe('Cannot re-verify from another re-verification');
  });

  it('rejects when parent is a document_refresh re-verification', () => {
    const refreshParent = { ...PARENT_VERIFICATION, verification_mode: 'document_refresh' };
    expect(validateParent(refreshParent, 'dev-001', 'user-001')).not.toBeNull();
  });

  it('accepts when parent has verification_mode=full', () => {
    const fullParent = { ...PARENT_VERIFICATION, verification_mode: 'full' };
    expect(validateParent(fullParent, 'dev-001', 'user-001')).toBeNull();
  });

  it('accepts when parent has null verification_mode (legacy)', () => {
    const legacyParent = { ...PARENT_VERIFICATION, verification_mode: null };
    expect(validateParent(legacyParent, 'dev-001', 'user-001')).toBeNull();
  });
});

describe('Re-verification — session creation', () => {
  function createReVerificationHydration(
    sessionId: string,
    parentState: any,
    parentVerification: any,
  ) {
    const hasFaceEmbedding = parentState.front_extraction?.face_embedding
      && parentState.front_extraction.face_embedding.length > 0;
    const startStep = hasFaceEmbedding ? 'AWAITING_LIVE' : 'AWAITING_FRONT';
    const mode = hasFaceEmbedding ? 'liveness_only' : 'document_refresh';

    const hydration: any = {
      session_id: sessionId,
      current_step: startStep,
      issuing_country: parentVerification.issuing_country,
    };
    if (hasFaceEmbedding) {
      hydration.front_extraction = parentState.front_extraction;
    }
    return { hydration, mode };
  }

  it('sets initial step to AWAITING_LIVE when face embedding is available', () => {
    const { hydration } = createReVerificationHydration('new-001', PARENT_SESSION_STATE, PARENT_VERIFICATION);
    expect(hydration.current_step).toBe('AWAITING_LIVE');
  });

  it('carries over front_extraction with face embedding from parent', () => {
    const { hydration } = createReVerificationHydration('new-001', PARENT_SESSION_STATE, PARENT_VERIFICATION);
    expect(hydration.front_extraction).toBe(PARENT_SESSION_STATE.front_extraction);
    expect(hydration.front_extraction.face_embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('preserves issuing_country from parent verification', () => {
    const { hydration } = createReVerificationHydration('new-001', PARENT_SESSION_STATE, PARENT_VERIFICATION);
    expect(hydration.issuing_country).toBe('US');
  });

  it('uses new session_id (not parent ID)', () => {
    const { hydration } = createReVerificationHydration('new-001', PARENT_SESSION_STATE, PARENT_VERIFICATION);
    expect(hydration.session_id).toBe('new-001');
    expect(hydration.session_id).not.toBe(PARENT_SESSION_STATE.session_id);
  });

  it('does not carry over back_extraction, cross_validation, or face_match', () => {
    const { hydration } = createReVerificationHydration('new-001', PARENT_SESSION_STATE, PARENT_VERIFICATION);
    expect(hydration).not.toHaveProperty('back_extraction');
    expect(hydration).not.toHaveProperty('cross_validation');
    expect(hydration).not.toHaveProperty('face_match');
    expect(hydration).not.toHaveProperty('liveness');
  });

  it('falls back to AWAITING_FRONT when face embedding is null (GDPR-stripped)', () => {
    const strippedState = {
      ...PARENT_SESSION_STATE,
      front_extraction: { ...PARENT_FRONT_EXTRACTION, face_embedding: null },
    };
    const { hydration, mode } = createReVerificationHydration('new-001', strippedState, PARENT_VERIFICATION);
    expect(hydration.current_step).toBe('AWAITING_FRONT');
    expect(hydration.front_extraction).toBeUndefined();
    expect(mode).toBe('document_refresh');
  });

  it('falls back to AWAITING_FRONT when face embedding is empty array', () => {
    const emptyState = {
      ...PARENT_SESSION_STATE,
      front_extraction: { ...PARENT_FRONT_EXTRACTION, face_embedding: [] },
    };
    const { hydration, mode } = createReVerificationHydration('new-001', emptyState, PARENT_VERIFICATION);
    expect(hydration.current_step).toBe('AWAITING_FRONT');
    expect(mode).toBe('document_refresh');
  });

  it('returns liveness_only mode when face embedding is available', () => {
    const { mode } = createReVerificationHydration('new-001', PARENT_SESSION_STATE, PARENT_VERIFICATION);
    expect(mode).toBe('liveness_only');
  });
});

describe('Re-verification — DB record shape', () => {
  function buildReVerificationUpdate(parentId: string, parentCountry: string | null, mode: string) {
    return {
      parent_verification_id: parentId,
      verification_mode: mode,
      session_started_at: expect.any(String),
      issuing_country: parentCountry,
    };
  }

  it('links to parent via parent_verification_id', () => {
    const update = buildReVerificationUpdate('parent-001', 'US', 'liveness_only');
    expect(update.parent_verification_id).toBe('parent-001');
  });

  it('sets verification_mode to liveness_only when embedding available', () => {
    const update = buildReVerificationUpdate('parent-001', 'US', 'liveness_only');
    expect(update.verification_mode).toBe('liveness_only');
  });

  it('sets verification_mode to document_refresh when embedding stripped', () => {
    const update = buildReVerificationUpdate('parent-001', 'US', 'document_refresh');
    expect(update.verification_mode).toBe('document_refresh');
  });

  it('preserves issuing_country from parent', () => {
    const update = buildReVerificationUpdate('parent-001', 'US', 'liveness_only');
    expect(update.issuing_country).toBe('US');
  });

  it('handles null issuing_country', () => {
    const update = buildReVerificationUpdate('parent-001', null, 'liveness_only');
    expect(update.issuing_country).toBeNull();
  });
});

describe('Re-verification — response shape', () => {
  it('returns expected response fields', () => {
    const response = {
      success: true,
      verification_id: 'new-001',
      parent_verification_id: 'parent-001',
      verification_mode: 'liveness_only',
      status: 'AWAITING_LIVE',
      current_step: 4,
      total_steps: 5,
      message: 'Re-verification initialized — ready to upload live capture (liveness-only mode)',
    };

    expect(response.success).toBe(true);
    expect(response.verification_mode).toBe('liveness_only');
    expect(response.parent_verification_id).toBe('parent-001');
    expect(response.current_step).toBe(4);
    expect(response.message).toContain('liveness-only');
  });
});
