import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationSession } from '../session/VerificationSession.js';
import { SessionFlowError } from '../exceptions.js';
import { VerificationStatus } from '../models/types.js';
import type { FrontExtractionResult, BackExtractionResult, LiveCaptureResult, FaceMatchResult, CrossValidationResult } from '../models/types.js';

// ─── Mock dependencies ─────────────────────────────────────────
// The session delegates to step functions; we mock those to isolate state machine logic.

const mockFrontResult: FrontExtractionResult = {
  ocr: {
    full_name: 'JOHN DOE',
    date_of_birth: '1990-01-15',
    id_number: 'AB1234567',
    expiry_date: '2030-12-31',
    nationality: 'USA',
  },
  face_embedding: [0.1, 0.2, 0.3],
  face_confidence: 0.92,
  ocr_confidence: 0.87,
  mrz_from_front: null,
};

const mockBackResult: BackExtractionResult = {
  qr_payload: {
    full_name: 'JOHN DOE',
    first_name: 'JOHN',
    last_name: 'DOE',
    date_of_birth: '1990-01-15',
    id_number: 'AB1234567',
    expiry_date: '2030-12-31',
    nationality: 'USA',
  },
  mrz_result: null,
  barcode_format: 'PDF417',
  raw_barcode_data: 'data',
};

const mockCrossValResult: CrossValidationResult = {
  overall_score: 0.95,
  field_scores: {
    id_number: { score: 1.0, passed: true, weight: 0.40 },
    full_name: { score: 1.0, passed: true, weight: 0.25 },
    date_of_birth: { score: 1.0, passed: true, weight: 0.20 },
    expiry_date: { score: 1.0, passed: true, weight: 0.10 },
    nationality: { score: 1.0, passed: true, weight: 0.05 },
  },
  has_critical_failure: false,
  document_expired: false,
  verdict: 'PASS',
};

const mockLiveResult: LiveCaptureResult = {
  face_embedding: [0.4, 0.5, 0.6],
  face_confidence: 0.95,
  liveness_passed: true,
  liveness_score: 0.88,
};

const mockFaceMatchResult: FaceMatchResult = {
  similarity_score: 0.82,
  passed: true,
  threshold_used: 0.60,
};

// Step function mocks
const mockExtractFront = vi.fn<(buffer: Buffer) => Promise<FrontExtractionResult>>();
const mockExtractBack = vi.fn<(buffer: Buffer) => Promise<BackExtractionResult>>();
const mockProcessLiveCapture = vi.fn<(buffer: Buffer) => Promise<LiveCaptureResult>>();
const mockComputeFaceMatch = vi.fn<(idEmb: number[], liveEmb: number[], threshold: number) => FaceMatchResult>();

function createSession(): VerificationSession {
  return new VerificationSession({
    extractFront: mockExtractFront,
    extractBack: mockExtractBack,
    processLiveCapture: mockProcessLiveCapture,
    computeFaceMatch: mockComputeFaceMatch,
    faceMatchThreshold: 0.60,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractFront.mockResolvedValue(mockFrontResult);
  mockExtractBack.mockResolvedValue(mockBackResult);
  mockProcessLiveCapture.mockResolvedValue(mockLiveResult);
  mockComputeFaceMatch.mockReturnValue(mockFaceMatchResult);
});

describe('VerificationSession — State Machine', () => {
  it('starts in AWAITING_FRONT state', () => {
    const session = createSession();
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_FRONT);
  });

  it('has a unique session_id', () => {
    const s1 = createSession();
    const s2 = createSession();
    expect(s1.getState().session_id).toBeTruthy();
    expect(s1.getState().session_id).not.toBe(s2.getState().session_id);
  });

  it('transitions to AWAITING_BACK after successful submitFront', async () => {
    const session = createSession();
    const result = await session.submitFront(Buffer.from('front-image'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_BACK);
    expect(session.getState().front_extraction).toEqual(mockFrontResult);
  });

  it('transitions to AWAITING_LIVE after successful submitBack (auto cross-validates)', async () => {
    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    const result = await session.submitBack(Buffer.from('back'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_LIVE);
    expect(session.getState().cross_validation).toBeDefined();
    expect(session.getState().back_extraction).toEqual(mockBackResult);
  });

  it('transitions to COMPLETE after successful submitLiveCapture (auto face-matches)', async () => {
    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(session.getState().face_match).toBeDefined();
    expect(session.getState().completed_at).toBeTruthy();
  });
});

describe('VerificationSession — Flow Enforcement', () => {
  it('throws SessionFlowError when calling submitBack before submitFront', async () => {
    const session = createSession();
    await expect(session.submitBack(Buffer.from('back'))).rejects.toThrow(SessionFlowError);
  });

  it('throws SessionFlowError when calling submitLiveCapture before submitBack', async () => {
    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await expect(session.submitLiveCapture(Buffer.from('selfie'))).rejects.toThrow(SessionFlowError);
  });

  it('throws SessionFlowError when calling submitLiveCapture in AWAITING_FRONT state', async () => {
    const session = createSession();
    await expect(session.submitLiveCapture(Buffer.from('selfie'))).rejects.toThrow(SessionFlowError);
  });

  it('includes current and expected step in SessionFlowError', async () => {
    const session = createSession();
    try {
      await session.submitBack(Buffer.from('back'));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e.currentStep).toBe(VerificationStatus.AWAITING_FRONT);
      expect(e.expectedStep).toBe(VerificationStatus.AWAITING_BACK);
    }
  });

  it('throws SessionFlowError when calling any method after HARD_REJECTED', async () => {
    // Make Gate 1 fail — all OCR fields empty (the only hard reject left in lenient Gate 1)
    mockExtractFront.mockResolvedValue({
      ...mockFrontResult,
      ocr: { full_name: '', date_of_birth: '', id_number: '', expiry_date: '' },
    });

    const session = createSession();
    const result = await session.submitFront(Buffer.from('front'));
    expect(result.passed).toBe(false);
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);

    // Subsequent calls should all throw
    await expect(session.submitFront(Buffer.from('retry'))).rejects.toThrow(SessionFlowError);
    await expect(session.submitBack(Buffer.from('back'))).rejects.toThrow(SessionFlowError);
    await expect(session.submitLiveCapture(Buffer.from('selfie'))).rejects.toThrow(SessionFlowError);
  });
});

describe('VerificationSession — Hard Rejection', () => {
  it('PASSES Gate 1 with low OCR confidence (soft check — lenient gate)', async () => {
    mockExtractFront.mockResolvedValue({
      ...mockFrontResult,
      ocr_confidence: 0.20,
    });

    const session = createSession();
    const result = await session.submitFront(Buffer.from('front'));
    // Gate 1 is lenient — low OCR confidence is a soft warning, not a hard reject
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_BACK);
  });

  it('transitions to HARD_REJECTED when Gate 1 fails (missing fields)', async () => {
    mockExtractFront.mockResolvedValue({
      ...mockFrontResult,
      ocr: { full_name: '', date_of_birth: '', id_number: '', expiry_date: '' },
    });

    const session = createSession();
    const result = await session.submitFront(Buffer.from('front'));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('transitions to HARD_REJECTED when Gate 2 fails (no barcode)', async () => {
    mockExtractBack.mockResolvedValue({
      qr_payload: null,
      mrz_result: null,
      barcode_format: null,
      raw_barcode_data: null,
    });

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    const result = await session.submitBack(Buffer.from('back'));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('BACK_BARCODE_NOT_FOUND');
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });

  it('transitions to HARD_REJECTED when Gate 3 fails (cross-validation)', async () => {
    // Back data with mismatched ID number to fail cross-validation
    mockExtractBack.mockResolvedValue({
      qr_payload: {
        full_name: 'ALICE SMITH',
        first_name: 'ALICE',
        last_name: 'SMITH',
        date_of_birth: '1985-06-20',
        id_number: 'XY9876543',
        expiry_date: '2030-12-31',
        nationality: 'GBR',
      },
      mrz_result: null,
      barcode_format: 'PDF417',
      raw_barcode_data: 'data',
    });

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    const result = await session.submitBack(Buffer.from('back'));
    expect(result.passed).toBe(false);
    // Should fail on cross-validation (auto-triggered after Gate 2 passes)
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });

  it('transitions to HARD_REJECTED when Gate 4 fails (liveness)', async () => {
    mockProcessLiveCapture.mockResolvedValue({
      ...mockLiveResult,
      liveness_passed: false,
      liveness_score: 0.20,
    });

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('LIVENESS_FAILED');
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });

  it('transitions to HARD_REJECTED when Gate 5 fails (face match)', async () => {
    mockComputeFaceMatch.mockReturnValue({
      similarity_score: 0.30,
      passed: false,
      threshold_used: 0.60,
    });

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FACE_MATCH_FAILED');
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });
});

describe('VerificationSession — HARD_REJECTED is terminal', () => {
  it('no method can advance past HARD_REJECTED', async () => {
    // All OCR fields empty — the only hard reject in lenient Gate 1
    mockExtractFront.mockResolvedValue({
      ...mockFrontResult,
      ocr: { full_name: '', date_of_birth: '', id_number: '', expiry_date: '' },
    });

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);

    // Try every possible method
    await expect(session.submitFront(Buffer.from('retry'))).rejects.toThrow(SessionFlowError);
    await expect(session.submitBack(Buffer.from('back'))).rejects.toThrow(SessionFlowError);
    await expect(session.submitLiveCapture(Buffer.from('selfie'))).rejects.toThrow(SessionFlowError);
  });
});

describe('VerificationSession — Cross-validation auto-triggers', () => {
  it('cross-validation runs automatically after Gate 2 passes', async () => {
    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));

    // Cross-validation should have run
    const state = session.getState();
    expect(state.cross_validation).toBeDefined();
    expect(state.cross_validation!.overall_score).toBeGreaterThan(0);
  });
});

describe('VerificationSession — Face match auto-triggers', () => {
  it('face match runs automatically after Gate 4 passes', async () => {
    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    await session.submitLiveCapture(Buffer.from('selfie'));

    expect(mockComputeFaceMatch).toHaveBeenCalled();
    expect(session.getState().face_match).toBeDefined();
  });

  it('auto-passes face match when both embeddings are empty (no TF available)', async () => {
    // Simulate no TensorFlow: both front and live have empty embeddings
    mockExtractFront.mockResolvedValue({
      ...mockFrontResult,
      face_embedding: null,
    });
    mockProcessLiveCapture.mockResolvedValue({
      ...mockLiveResult,
      face_embedding: [],
    });

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));

    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    // computeFaceMatch should NOT be called when no embeddings exist
    expect(mockComputeFaceMatch).not.toHaveBeenCalled();
    // Auto-pass should set similarity to 1.0
    expect(session.getState().face_match!.similarity_score).toBe(1.0);
    expect(session.getState().face_match!.passed).toBe(true);
  });

  it('auto-passes face match when ID has no face embedding but selfie does', async () => {
    // Simulate: small ID photo — face-api cannot detect the face on the card,
    // but the selfie has a good face embedding.
    mockExtractFront.mockResolvedValue({
      ...mockFrontResult,
      face_embedding: null,
      face_confidence: 0,
    });
    // Live capture has a valid embedding (selfie face detected)
    mockProcessLiveCapture.mockResolvedValue(mockLiveResult);

    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));

    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(mockComputeFaceMatch).not.toHaveBeenCalled();
    expect(session.getState().face_match!.similarity_score).toBe(1.0);
    expect(session.getState().face_match!.passed).toBe(true);
  });

  it('uses real face matching when embeddings are available', async () => {
    const session = createSession();
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    await session.submitLiveCapture(Buffer.from('selfie'));

    // Should use the real computeFaceMatch with actual embeddings
    expect(mockComputeFaceMatch).toHaveBeenCalledWith(
      mockFrontResult.face_embedding,
      mockLiveResult.face_embedding,
      0.60,
    );
  });
});

describe('VerificationSession — Hydration', () => {
  it('can be hydrated from saved state with a custom session_id', () => {
    const session = new VerificationSession({
      ...createSession()['deps'],
      extractFront: mockExtractFront,
      extractBack: mockExtractBack,
      processLiveCapture: mockProcessLiveCapture,
      computeFaceMatch: mockComputeFaceMatch,
    }, {
      session_id: 'custom-id-123',
    });
    expect(session.getState().session_id).toBe('custom-id-123');
  });

  it('can be hydrated to AWAITING_BACK state and continue from submitBack', async () => {
    const session = new VerificationSession({
      extractFront: mockExtractFront,
      extractBack: mockExtractBack,
      processLiveCapture: mockProcessLiveCapture,
      computeFaceMatch: mockComputeFaceMatch,
      faceMatchThreshold: 0.60,
    }, {
      session_id: 'hydrated-session',
      current_step: VerificationStatus.AWAITING_BACK,
      front_extraction: mockFrontResult,
    });

    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_BACK);
    expect(session.getState().front_extraction).toEqual(mockFrontResult);

    // Should be able to continue with submitBack
    const result = await session.submitBack(Buffer.from('back'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_LIVE);
  });

  it('can be hydrated to AWAITING_LIVE state and continue from submitLiveCapture', async () => {
    const session = new VerificationSession({
      extractFront: mockExtractFront,
      extractBack: mockExtractBack,
      processLiveCapture: mockProcessLiveCapture,
      computeFaceMatch: mockComputeFaceMatch,
      faceMatchThreshold: 0.60,
    }, {
      session_id: 'hydrated-live',
      current_step: VerificationStatus.AWAITING_LIVE,
      front_extraction: mockFrontResult,
      back_extraction: mockBackResult,
      cross_validation: mockCrossValResult,
    });

    const result = await session.submitLiveCapture(Buffer.from('selfie'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
  });

  it('hydrated HARD_REJECTED session cannot advance', async () => {
    const session = new VerificationSession({
      extractFront: mockExtractFront,
      extractBack: mockExtractBack,
      processLiveCapture: mockProcessLiveCapture,
      computeFaceMatch: mockComputeFaceMatch,
    }, {
      session_id: 'rejected-session',
      current_step: VerificationStatus.HARD_REJECTED,
      rejection_reason: 'FRONT_OCR_FAILED',
    });

    await expect(session.submitFront(Buffer.from('front'))).rejects.toThrow(SessionFlowError);
  });
});
