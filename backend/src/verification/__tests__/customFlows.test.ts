import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationSession } from '../session/VerificationSession.js';
import { SessionFlowError } from '../exceptions.js';
import { VerificationStatus, FLOW_PRESETS } from '@idswyft/shared';
import type {
  FrontExtractionResult,
  BackExtractionResult,
  LiveCaptureResult,
  FaceMatchResult,
  FlowConfig,
} from '@idswyft/shared';

// ─── Mock data ─────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────

const mockExtractFront = vi.fn<(buffer: Buffer) => Promise<FrontExtractionResult>>();
const mockExtractBack = vi.fn<(buffer: Buffer) => Promise<BackExtractionResult>>();
const mockProcessLiveCapture = vi.fn<(buffer: Buffer) => Promise<LiveCaptureResult>>();
const mockComputeFaceMatch = vi.fn<(idEmb: number[], liveEmb: number[], threshold: number) => FaceMatchResult>();

function createSession(flow?: FlowConfig): VerificationSession {
  return new VerificationSession(
    {
      extractFront: mockExtractFront,
      extractBack: mockExtractBack,
      processLiveCapture: mockProcessLiveCapture,
      computeFaceMatch: mockComputeFaceMatch,
      faceMatchThreshold: 0.60,
    },
    undefined,
    flow,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractFront.mockResolvedValue(mockFrontResult);
  mockExtractBack.mockResolvedValue(mockBackResult);
  mockProcessLiveCapture.mockResolvedValue(mockLiveResult);
  mockComputeFaceMatch.mockReturnValue(mockFaceMatchResult);
});

// ─── FLOW_PRESETS structure ────────────────────────────

describe('FLOW_PRESETS — structure and correctness', () => {
  it('has all five preset keys', () => {
    expect(Object.keys(FLOW_PRESETS)).toEqual(
      expect.arrayContaining(['full', 'document_only', 'identity', 'liveness_only', 'age_only']),
    );
  });

  it('full preset requires all gates', () => {
    const f = FLOW_PRESETS.full;
    expect(f.requiresBack).toBe(true);
    expect(f.requiresLiveness).toBe(true);
    expect(f.requiresFaceMatch).toBe(true);
    expect(f.totalSteps).toBe(5);
  });

  it('document_only skips liveness and face match', () => {
    const f = FLOW_PRESETS.document_only;
    expect(f.requiresBack).toBe(true);
    expect(f.requiresLiveness).toBe(false);
    expect(f.requiresFaceMatch).toBe(false);
    expect(f.totalSteps).toBe(3);
    expect(f.afterCrossVal).toBe('COMPLETE');
  });

  it('identity skips back doc and cross-validation', () => {
    const f = FLOW_PRESETS.identity;
    expect(f.requiresBack).toBe(false);
    expect(f.requiresLiveness).toBe(true);
    expect(f.requiresFaceMatch).toBe(true);
    expect(f.totalSteps).toBe(3);
    expect(f.afterFront).toBe('AWAITING_LIVE');
  });

  it('age_only is a single step', () => {
    const f = FLOW_PRESETS.age_only;
    expect(f.requiresBack).toBe(false);
    expect(f.requiresLiveness).toBe(false);
    expect(f.requiresFaceMatch).toBe(false);
    expect(f.totalSteps).toBe(1);
    expect(f.afterFront).toBe('COMPLETE');
  });
});

// ─── Full flow (default, regression) ──────────────────

describe('Custom Flows — full (default)', () => {
  it('full flow runs all 5 gates: front → back → crossval → liveness → face match', async () => {
    const session = createSession(FLOW_PRESETS.full);

    await session.submitFront(Buffer.from('front'));
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_BACK);

    await session.submitBack(Buffer.from('back'));
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_LIVE);

    await session.submitLiveCapture(Buffer.from('selfie'));
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(session.getState().completed_at).toBeTruthy();
    expect(mockComputeFaceMatch).toHaveBeenCalled();
  });

  it('defaults to full when no flow is specified', async () => {
    const session = createSession(); // no flow arg
    await session.submitFront(Buffer.from('front'));
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_BACK);
  });
});

// ─── document_only flow ───────────────────────────────

describe('Custom Flows — document_only', () => {
  it('completes after front → back → crossval (no liveness, no face match)', async () => {
    const session = createSession(FLOW_PRESETS.document_only);

    await session.submitFront(Buffer.from('front'));
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_BACK);

    await session.submitBack(Buffer.from('back'));
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(session.getState().completed_at).toBeTruthy();
    expect(session.getState().cross_validation).toBeDefined();

    // Liveness and face match should never have been called
    expect(mockProcessLiveCapture).not.toHaveBeenCalled();
    expect(mockComputeFaceMatch).not.toHaveBeenCalled();
  });

  it('does not allow submitLiveCapture after completion', async () => {
    const session = createSession(FLOW_PRESETS.document_only);
    await session.submitFront(Buffer.from('front'));
    await session.submitBack(Buffer.from('back'));
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);

    await expect(session.submitLiveCapture(Buffer.from('selfie'))).rejects.toThrow(SessionFlowError);
  });

  it('hard rejects when cross-validation fails', async () => {
    // Mismatched back data to fail cross-validation
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

    const session = createSession(FLOW_PRESETS.document_only);
    await session.submitFront(Buffer.from('front'));
    const result = await session.submitBack(Buffer.from('back'));

    expect(result.passed).toBe(false);
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });
});

// ─── identity flow ────────────────────────────────────

describe('Custom Flows — identity', () => {
  it('skips back doc: front → liveness → face match → COMPLETE', async () => {
    const session = createSession(FLOW_PRESETS.identity);

    await session.submitFront(Buffer.from('front'));
    // identity flow goes directly to AWAITING_LIVE (skip back/crossval)
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_LIVE);

    await session.submitLiveCapture(Buffer.from('selfie'));
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(session.getState().completed_at).toBeTruthy();
    expect(mockComputeFaceMatch).toHaveBeenCalled();

    // Back extraction should never have been called
    expect(mockExtractBack).not.toHaveBeenCalled();
    // No cross-validation data
    expect(session.getState().cross_validation).toBeNull();
    expect(session.getState().back_extraction).toBeNull();
  });

  it('submitBack throws SessionFlowError (back doc not expected)', async () => {
    const session = createSession(FLOW_PRESETS.identity);
    await session.submitFront(Buffer.from('front'));
    // Session is in AWAITING_LIVE, calling submitBack should fail
    await expect(session.submitBack(Buffer.from('back'))).rejects.toThrow(SessionFlowError);
  });

  it('hard rejects on liveness failure', async () => {
    mockProcessLiveCapture.mockResolvedValue({
      ...mockLiveResult,
      liveness_passed: false,
      liveness_score: 0.15,
    });

    const session = createSession(FLOW_PRESETS.identity);
    await session.submitFront(Buffer.from('front'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));

    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('LIVENESS_FAILED');
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });

  it('hard rejects on face match failure', async () => {
    mockComputeFaceMatch.mockReturnValue({
      similarity_score: 0.25,
      passed: false,
      threshold_used: 0.60,
    });

    const session = createSession(FLOW_PRESETS.identity);
    await session.submitFront(Buffer.from('front'));
    const result = await session.submitLiveCapture(Buffer.from('selfie'));

    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FACE_MATCH_FAILED');
    expect(session.getState().current_step).toBe(VerificationStatus.HARD_REJECTED);
  });
});

// ─── liveness_only flow ───────────────────────────────

describe('Custom Flows — liveness_only', () => {
  it('front transitions directly to AWAITING_LIVE', async () => {
    const session = createSession(FLOW_PRESETS.liveness_only);

    await session.submitFront(Buffer.from('front'));
    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_LIVE);

    await session.submitLiveCapture(Buffer.from('selfie'));
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(session.getState().completed_at).toBeTruthy();
  });
});

// ─── age_only flow ────────────────────────────────────

describe('Custom Flows — age_only', () => {
  it('age_only flow config marks afterFront as COMPLETE', () => {
    expect(FLOW_PRESETS.age_only.afterFront).toBe('COMPLETE');
    expect(FLOW_PRESETS.age_only.requiresBack).toBe(false);
    expect(FLOW_PRESETS.age_only.requiresLiveness).toBe(false);
  });
});

// ─── Hydration with flow ──────────────────────────────

describe('Custom Flows — Hydration', () => {
  it('hydrated identity session in AWAITING_LIVE can continue to COMPLETE', async () => {
    const session = new VerificationSession(
      {
        extractFront: mockExtractFront,
        extractBack: mockExtractBack,
        processLiveCapture: mockProcessLiveCapture,
        computeFaceMatch: mockComputeFaceMatch,
        faceMatchThreshold: 0.60,
      },
      {
        session_id: 'identity-hydrated',
        current_step: VerificationStatus.AWAITING_LIVE,
        front_extraction: mockFrontResult,
      },
      FLOW_PRESETS.identity,
    );

    expect(session.getState().current_step).toBe(VerificationStatus.AWAITING_LIVE);
    const result = await session.submitLiveCapture(Buffer.from('selfie'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
  });

  it('hydrated document_only session in AWAITING_BACK can continue to COMPLETE', async () => {
    const session = new VerificationSession(
      {
        extractFront: mockExtractFront,
        extractBack: mockExtractBack,
        processLiveCapture: mockProcessLiveCapture,
        computeFaceMatch: mockComputeFaceMatch,
        faceMatchThreshold: 0.60,
      },
      {
        session_id: 'doconly-hydrated',
        current_step: VerificationStatus.AWAITING_BACK,
        front_extraction: mockFrontResult,
      },
      FLOW_PRESETS.document_only,
    );

    const result = await session.submitBack(Buffer.from('back'));
    expect(result.passed).toBe(true);
    expect(session.getState().current_step).toBe(VerificationStatus.COMPLETE);
    expect(session.getState().completed_at).toBeTruthy();
    // No liveness triggered
    expect(mockProcessLiveCapture).not.toHaveBeenCalled();
  });
});

// ─── Flow field on session ────────────────────────────

describe('Custom Flows — flow field', () => {
  it('exposes flow config on the session', () => {
    const session = createSession(FLOW_PRESETS.identity);
    expect(session.flow.preset).toBe('identity');
    expect(session.flow.totalSteps).toBe(3);
  });

  it('defaults to full when flow not provided', () => {
    const session = createSession();
    expect(session.flow.preset).toBe('full');
    expect(session.flow.totalSteps).toBe(5);
  });
});
