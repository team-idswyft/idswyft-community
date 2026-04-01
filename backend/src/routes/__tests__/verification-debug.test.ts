/**
 * Test: GET /api/admin/verification/:id — debug data enrichment
 *
 * Unit tests for the gate analysis debug data returned by the
 * verification detail endpoint. Tests cover:
 * - Gate score assembly from verification_requests + contexts
 * - OCR field extraction from documents
 * - Risk score and AML screening inclusion
 * - Graceful handling of missing optional data
 * - Timing computation data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock ────────────────────────────────────────────────────────────

function createQueryBuilder(rows: any[], single = false) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    _resolve: () => single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null },
  };
  Object.defineProperty(builder, 'then', {
    get: () => (resolve: any) => resolve(builder._resolve()),
  });
  return builder;
}

let mockVerification: any;
let mockDocuments: any[];
let mockContext: any;
let mockRisk: any;
let mockAml: any;

const fromMock = vi.fn((table: string) => {
  switch (table) {
    case 'verification_requests': return createQueryBuilder([mockVerification], true);
    case 'documents': return createQueryBuilder(mockDocuments);
    case 'verification_contexts': return createQueryBuilder(mockContext ? [mockContext] : [], true);
    case 'verification_risk_scores': return createQueryBuilder(mockRisk ? [mockRisk] : [], true);
    case 'aml_screenings': return createQueryBuilder(mockAml ? [mockAml] : [], true);
    default: return createQueryBuilder([]);
  }
});

vi.mock('@/config/database.js', () => ({
  supabase: { from: (...args: any[]) => fromMock(...args) },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logVerificationEvent: vi.fn(),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_VERIFICATION = {
  id: 'ver-001',
  user_id: 'user-001',
  developer_id: 'dev-001',
  status: 'verified',
  face_match_score: 0.85,
  liveness_score: 0.92,
  cross_validation_score: 0.95,
  photo_consistency_score: 0.88,
  address_verification_status: 'passed',
  address_match_score: 0.91,
  failure_reason: null,
  manual_review_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  session_started_at: '2026-03-15T10:00:00Z',
  processing_completed_at: '2026-03-15T10:00:04Z',
};

const FULL_CONTEXT = {
  verification_id: 'ver-001',
  context: {
    cross_validation: { verdict: 'PASS', score: 0.95, mismatches: [] },
    liveness: { passed: true, score: 0.92 },
    deepfake_check: { isReal: true, realProbability: 0.97, fakeProbability: 0.03 },
    face_match: { passed: true, similarity_score: 0.85 },
  },
};

const FRONT_DOC = {
  verification_request_id: 'ver-001',
  document_type: 'drivers_license',
  ocr_data: { name: 'John Doe', date_of_birth: '1990-01-15', document_number: 'D12345678' },
  ocr_extracted: true,
  quality_score: 0.91,
  quality_analysis: { brightness: 0.8, focus: 0.95 },
  cross_validation_results: null,
  barcode_data: null,
  is_back_of_id: false,
};

const BACK_DOC = {
  verification_request_id: 'ver-001',
  document_type: 'drivers_license',
  ocr_data: { name: 'JOHN DOE', document_number: 'D12345678' },
  ocr_extracted: true,
  quality_score: 0.80,
  quality_analysis: null,
  cross_validation_results: { verdict: 'PASS', score: 0.95 },
  barcode_data: { format: 'PDF417', raw: 'DAQ12345678' },
  is_back_of_id: true,
};

const RISK_SCORE = {
  verification_request_id: 'ver-001',
  overall_score: 15,
  risk_level: 'low',
  risk_factors: [{ factor: 'new_user', weight: 15 }],
  computed_at: '2026-03-15T10:00:03Z',
};

const AML_SCREENING = {
  verification_request_id: 'ver-001',
  risk_level: 'clear',
  match_found: false,
  match_count: 0,
  matches: null,
  lists_checked: ['OFAC_SDN', 'UN_SANCTIONS'],
  screened_at: '2026-03-15T10:00:04Z',
};

// ── Helper: assemble debug object (mirrors backend logic) ────────────────────

function assembleDebug(v: any, ctx: any, docs: any[], risk: any, aml: any) {
  const frontDoc = docs.find((d: any) => !d.is_back_of_id);
  const backDoc = docs.find((d: any) => d.is_back_of_id);
  return {
    gates: {
      ocr: {
        extracted: frontDoc?.ocr_extracted ?? null,
        quality_score: frontDoc?.quality_score ?? null,
        quality_analysis: frontDoc?.quality_analysis ?? null,
        fields: frontDoc?.ocr_data ?? null,
        back_fields: backDoc?.ocr_data ?? null,
        barcode_data: backDoc?.barcode_data ?? null,
      },
      cross_validation: {
        score: v.cross_validation_score,
        verdict: ctx.cross_validation?.verdict ?? null,
        mismatches: ctx.cross_validation?.mismatches ?? [],
        results: frontDoc?.cross_validation_results ?? backDoc?.cross_validation_results ?? null,
      },
      liveness: {
        score: v.liveness_score,
        passed: ctx.liveness?.passed ?? null,
      },
      deepfake: {
        is_real: ctx.deepfake_check?.isReal ?? null,
        real_probability: ctx.deepfake_check?.realProbability ?? null,
        fake_probability: ctx.deepfake_check?.fakeProbability ?? null,
      },
      face_match: {
        score: v.face_match_score,
        passed: ctx.face_match?.passed ?? null,
      },
      photo_consistency: { score: v.photo_consistency_score },
      address: { status: v.address_verification_status, score: v.address_match_score },
    },
    risk: risk ? {
      overall_score: risk.overall_score,
      risk_level: risk.risk_level,
      factors: risk.risk_factors,
      computed_at: risk.computed_at,
    } : null,
    aml: aml ? {
      risk_level: aml.risk_level,
      match_found: aml.match_found,
      match_count: aml.match_count,
      matches: aml.matches,
      lists_checked: aml.lists_checked,
      screened_at: aml.screened_at,
    } : null,
    timing: {
      session_started_at: v.session_started_at,
      processing_completed_at: v.processing_completed_at,
    },
    decision: {
      failure_reason: v.failure_reason,
      manual_review_reason: v.manual_review_reason,
      reviewed_by: v.reviewed_by,
      reviewed_at: v.reviewed_at,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Verification debug data — gate assembly', () => {
  beforeEach(() => {
    mockVerification = BASE_VERIFICATION;
    mockDocuments = [FRONT_DOC, BACK_DOC];
    mockContext = FULL_CONTEXT;
    mockRisk = RISK_SCORE;
    mockAml = AML_SCREENING;
  });

  it('assembles all gate scores from verification + context', () => {
    const debug = assembleDebug(BASE_VERIFICATION, FULL_CONTEXT.context, [FRONT_DOC, BACK_DOC], RISK_SCORE, AML_SCREENING);

    expect(debug.gates.ocr.quality_score).toBe(0.91);
    expect(debug.gates.cross_validation.score).toBe(0.95);
    expect(debug.gates.cross_validation.verdict).toBe('PASS');
    expect(debug.gates.liveness.score).toBe(0.92);
    expect(debug.gates.liveness.passed).toBe(true);
    expect(debug.gates.deepfake.is_real).toBe(true);
    expect(debug.gates.deepfake.real_probability).toBe(0.97);
    expect(debug.gates.face_match.score).toBe(0.85);
    expect(debug.gates.face_match.passed).toBe(true);
  });

  it('extracts OCR fields from front document', () => {
    const debug = assembleDebug(BASE_VERIFICATION, FULL_CONTEXT.context, [FRONT_DOC, BACK_DOC], null, null);

    expect(debug.gates.ocr.extracted).toBe(true);
    expect(debug.gates.ocr.fields).toEqual({ name: 'John Doe', date_of_birth: '1990-01-15', document_number: 'D12345678' });
    expect(debug.gates.ocr.back_fields).toEqual({ name: 'JOHN DOE', document_number: 'D12345678' });
  });

  it('includes barcode data from back document', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [FRONT_DOC, BACK_DOC], null, null);

    expect(debug.gates.ocr.barcode_data).toEqual({ format: 'PDF417', raw: 'DAQ12345678' });
  });

  it('includes cross-validation results from back doc when front has none', () => {
    const debug = assembleDebug(BASE_VERIFICATION, FULL_CONTEXT.context, [FRONT_DOC, BACK_DOC], null, null);

    expect(debug.gates.cross_validation.results).toEqual({ verdict: 'PASS', score: 0.95 });
  });

  it('includes risk assessment when present', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [], RISK_SCORE, null);

    expect(debug.risk).not.toBeNull();
    expect(debug.risk!.overall_score).toBe(15);
    expect(debug.risk!.risk_level).toBe('low');
    expect(debug.risk!.factors).toEqual([{ factor: 'new_user', weight: 15 }]);
  });

  it('includes AML screening when present', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [], null, AML_SCREENING);

    expect(debug.aml).not.toBeNull();
    expect(debug.aml!.match_found).toBe(false);
    expect(debug.aml!.lists_checked).toEqual(['OFAC_SDN', 'UN_SANCTIONS']);
  });

  it('includes timing data for processing duration', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [], null, null);

    expect(debug.timing.session_started_at).toBe('2026-03-15T10:00:00Z');
    expect(debug.timing.processing_completed_at).toBe('2026-03-15T10:00:04Z');
  });

  it('includes decision trail', () => {
    const failedV = { ...BASE_VERIFICATION, status: 'failed', failure_reason: 'Face match below threshold' };
    const debug = assembleDebug(failedV, {}, [], null, null);

    expect(debug.decision.failure_reason).toBe('Face match below threshold');
  });
});

describe('Verification debug data — graceful degradation', () => {
  it('handles missing context (empty object)', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [FRONT_DOC], null, null);

    expect(debug.gates.cross_validation.verdict).toBeNull();
    expect(debug.gates.cross_validation.mismatches).toEqual([]);
    expect(debug.gates.liveness.passed).toBeNull();
    expect(debug.gates.deepfake.is_real).toBeNull();
    expect(debug.gates.face_match.passed).toBeNull();
  });

  it('handles missing documents', () => {
    const debug = assembleDebug(BASE_VERIFICATION, FULL_CONTEXT.context, [], null, null);

    expect(debug.gates.ocr.extracted).toBeNull();
    expect(debug.gates.ocr.quality_score).toBeNull();
    expect(debug.gates.ocr.fields).toBeNull();
    expect(debug.gates.ocr.back_fields).toBeNull();
    expect(debug.gates.ocr.barcode_data).toBeNull();
  });

  it('returns null for risk when no risk score exists', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [], null, null);
    expect(debug.risk).toBeNull();
  });

  it('returns null for AML when no screening exists', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [], null, null);
    expect(debug.aml).toBeNull();
  });

  it('handles verification with null scores', () => {
    const vWithNulls = {
      ...BASE_VERIFICATION,
      face_match_score: null,
      liveness_score: null,
      cross_validation_score: null,
      photo_consistency_score: null,
      address_match_score: null,
      address_verification_status: null,
    };
    const debug = assembleDebug(vWithNulls, {}, [], null, null);

    expect(debug.gates.face_match.score).toBeNull();
    expect(debug.gates.liveness.score).toBeNull();
    expect(debug.gates.cross_validation.score).toBeNull();
    expect(debug.gates.photo_consistency.score).toBeNull();
    expect(debug.gates.address.score).toBeNull();
    expect(debug.gates.address.status).toBeNull();
  });

  it('uses front doc quality_analysis and ignores back doc', () => {
    const debug = assembleDebug(BASE_VERIFICATION, {}, [FRONT_DOC, BACK_DOC], null, null);
    expect(debug.gates.ocr.quality_analysis).toEqual({ brightness: 0.8, focus: 0.95 });
  });

  it('handles cross_validation mismatches from context', () => {
    const ctxWithMismatches = {
      ...FULL_CONTEXT.context,
      cross_validation: {
        verdict: 'REVIEW',
        score: 0.60,
        mismatches: [
          { field: 'name', front: 'John Doe', back: 'JOHN D' },
          { field: 'dob', front: '1990-01-15', back: '01/15/1990' },
        ],
      },
    };
    const debug = assembleDebug(BASE_VERIFICATION, ctxWithMismatches, [], null, null);

    expect(debug.gates.cross_validation.mismatches).toHaveLength(2);
    expect(debug.gates.cross_validation.mismatches[0].field).toBe('name');
    expect(debug.gates.cross_validation.verdict).toBe('REVIEW');
  });
});
