import { describe, it, expect } from 'vitest';
import {
  FrontExtractionResultSchema,
  BackExtractionResultSchema,
  CrossValidationResultSchema,
  LiveCaptureResultSchema,
  FaceMatchResultSchema,
  GateResultSchema,
  VerificationStatus,
  RejectionReason,
  type SessionState,
} from '../models/schemas.js';

describe('FrontExtractionResultSchema', () => {
  it('accepts valid front extraction data', () => {
    const valid = {
      ocr: {
        full_name: 'JOHN DOE',
        date_of_birth: '1990-01-15',
        id_number: 'AB1234567',
        expiry_date: '2030-12-31',
        nationality: 'USA',
      },
      face_embedding: null,
      face_confidence: 0.92,
      ocr_confidence: 0.87,
      mrz_from_front: null,
    };
    const result = FrontExtractionResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects when required OCR fields are missing', () => {
    const invalid = {
      ocr: {
        full_name: 'JOHN DOE',
        // missing: date_of_birth, id_number, expiry_date
      },
      face_embedding: null,
      face_confidence: 0.92,
      ocr_confidence: 0.87,
      mrz_from_front: null,
    };
    const result = FrontExtractionResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects negative confidence values', () => {
    const invalid = {
      ocr: {
        full_name: 'JOHN DOE',
        date_of_birth: '1990-01-15',
        id_number: 'AB1234567',
        expiry_date: '2030-12-31',
      },
      face_embedding: null,
      face_confidence: -0.1,
      ocr_confidence: 0.87,
      mrz_from_front: null,
    };
    const result = FrontExtractionResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects confidence values above 1.0', () => {
    const invalid = {
      ocr: {
        full_name: 'JOHN DOE',
        date_of_birth: '1990-01-15',
        id_number: 'AB1234567',
        expiry_date: '2030-12-31',
      },
      face_embedding: null,
      face_confidence: 0.5,
      ocr_confidence: 1.5,
      mrz_from_front: null,
    };
    const result = FrontExtractionResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts valid MRZ lines from front', () => {
    const valid = {
      ocr: {
        full_name: 'JOHN DOE',
        date_of_birth: '1990-01-15',
        id_number: 'AB1234567',
        expiry_date: '2030-12-31',
      },
      face_embedding: [0.1, 0.2, 0.3],
      face_confidence: 0.95,
      ocr_confidence: 0.90,
      mrz_from_front: ['P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AB12345671USA9001150M3012310<<<<<<<<<<<<<<00'],
    };
    const result = FrontExtractionResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('BackExtractionResultSchema', () => {
  it('accepts valid back extraction data with PDF417', () => {
    const valid = {
      qr_payload: {
        first_name: 'JOHN',
        last_name: 'DOE',
        date_of_birth: '1990-01-15',
        id_number: 'AB1234567',
        expiry_date: '2030-12-31',
      },
      mrz_result: null,
      barcode_format: 'PDF417' as const,
      raw_barcode_data: '@\n\x1e\rANSI...',
    };
    const result = BackExtractionResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts null qr_payload (no barcode found)', () => {
    const valid = {
      qr_payload: null,
      mrz_result: null,
      barcode_format: null,
      raw_barcode_data: null,
    };
    const result = BackExtractionResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid barcode format', () => {
    const invalid = {
      qr_payload: null,
      mrz_result: null,
      barcode_format: 'INVALID_FORMAT',
      raw_barcode_data: null,
    };
    const result = BackExtractionResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('CrossValidationResultSchema', () => {
  it('accepts valid cross-validation results', () => {
    const valid = {
      overall_score: 0.95,
      field_scores: {
        id_number: { score: 1.0, passed: true, weight: 0.40 },
        full_name: { score: 0.93, passed: true, weight: 0.25 },
        date_of_birth: { score: 1.0, passed: true, weight: 0.20 },
        expiry_date: { score: 1.0, passed: true, weight: 0.10 },
        nationality: { score: 1.0, passed: true, weight: 0.05 },
      },
      has_critical_failure: false,
      document_expired: false,
      verdict: 'PASS' as const,
    };
    const result = CrossValidationResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects overall_score outside 0-1 range', () => {
    const invalid = {
      overall_score: 1.5,
      field_scores: {},
      has_critical_failure: false,
      document_expired: false,
      verdict: 'PASS',
    };
    const result = CrossValidationResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid verdict values', () => {
    const invalid = {
      overall_score: 0.80,
      field_scores: {},
      has_critical_failure: false,
      document_expired: false,
      verdict: 'MAYBE',
    };
    const result = CrossValidationResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('LiveCaptureResultSchema', () => {
  it('accepts valid live capture result', () => {
    const valid = {
      face_embedding: [0.1, 0.2, 0.3],
      face_confidence: 0.95,
      liveness_passed: true,
      liveness_score: 0.88,
    };
    const result = LiveCaptureResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts null face_embedding (face detection may not be available)', () => {
    const valid = {
      face_embedding: null,
      face_confidence: 0.95,
      liveness_passed: true,
      liveness_score: 0.88,
    };
    const result = LiveCaptureResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects liveness_score outside 0-1 range', () => {
    const invalid = {
      face_embedding: [0.1],
      face_confidence: 0.95,
      liveness_passed: true,
      liveness_score: -0.1,
    };
    const result = LiveCaptureResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('FaceMatchResultSchema', () => {
  it('accepts valid face match result', () => {
    const valid = {
      similarity_score: 0.78,
      passed: true,
      threshold_used: 0.60,
    };
    const result = FaceMatchResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects similarity_score above 1.0', () => {
    const invalid = {
      similarity_score: 1.1,
      passed: true,
      threshold_used: 0.60,
    };
    const result = FaceMatchResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('GateResultSchema', () => {
  it('accepts passing gate result', () => {
    const valid = {
      passed: true,
      rejection_reason: null,
      rejection_detail: null,
      user_message: null,
    };
    const result = GateResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts failing gate result with reason', () => {
    const valid = {
      passed: false,
      rejection_reason: 'FRONT_OCR_FAILED',
      rejection_detail: 'OCR could not read the document',
      user_message: 'Please retake the front of your ID',
    };
    const result = GateResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects unknown rejection reasons', () => {
    const invalid = {
      passed: false,
      rejection_reason: 'UNKNOWN_REASON',
      rejection_detail: 'Some detail',
      user_message: 'Some message',
    };
    const result = GateResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('VerificationStatus enum', () => {
  it('has exactly 10 states per spec', () => {
    expect(Object.keys(VerificationStatus).length).toBe(10);
  });

  it('includes all spec-defined states', () => {
    expect(VerificationStatus.AWAITING_FRONT).toBe('AWAITING_FRONT');
    expect(VerificationStatus.FRONT_PROCESSING).toBe('FRONT_PROCESSING');
    expect(VerificationStatus.AWAITING_BACK).toBe('AWAITING_BACK');
    expect(VerificationStatus.BACK_PROCESSING).toBe('BACK_PROCESSING');
    expect(VerificationStatus.CROSS_VALIDATING).toBe('CROSS_VALIDATING');
    expect(VerificationStatus.AWAITING_LIVE).toBe('AWAITING_LIVE');
    expect(VerificationStatus.LIVE_PROCESSING).toBe('LIVE_PROCESSING');
    expect(VerificationStatus.FACE_MATCHING).toBe('FACE_MATCHING');
    expect(VerificationStatus.COMPLETE).toBe('COMPLETE');
    expect(VerificationStatus.HARD_REJECTED).toBe('HARD_REJECTED');
  });
});

describe('RejectionReason enum', () => {
  it('has exactly 14 reasons (12 original + 2 security)', () => {
    expect(Object.keys(RejectionReason).length).toBe(14);
  });

  it('includes all spec-defined reasons', () => {
    expect(RejectionReason.FRONT_OCR_FAILED).toBe('FRONT_OCR_FAILED');
    expect(RejectionReason.FRONT_LOW_CONFIDENCE).toBe('FRONT_LOW_CONFIDENCE');
    expect(RejectionReason.BACK_BARCODE_NOT_FOUND).toBe('BACK_BARCODE_NOT_FOUND');
    expect(RejectionReason.BACK_MRZ_CHECKSUM_FAILED).toBe('BACK_MRZ_CHECKSUM_FAILED');
    expect(RejectionReason.BACK_MRZ_BARCODE_MISMATCH).toBe('BACK_MRZ_BARCODE_MISMATCH');
    expect(RejectionReason.CROSS_VALIDATION_FAILED).toBe('CROSS_VALIDATION_FAILED');
    expect(RejectionReason.DOCUMENT_EXPIRED).toBe('DOCUMENT_EXPIRED');
    expect(RejectionReason.LIVENESS_FAILED).toBe('LIVENESS_FAILED');
    expect(RejectionReason.FACE_NOT_DETECTED).toBe('FACE_NOT_DETECTED');
    expect(RejectionReason.FACE_MATCH_FAILED).toBe('FACE_MATCH_FAILED');
    expect(RejectionReason.AML_MATCH_FOUND).toBe('AML_MATCH_FOUND');
    expect(RejectionReason.AML_POTENTIAL_MATCH).toBe('AML_POTENTIAL_MATCH');
    expect(RejectionReason.DOCUMENT_TAMPERED).toBe('DOCUMENT_TAMPERED');
    expect(RejectionReason.DEEPFAKE_DETECTED).toBe('DEEPFAKE_DETECTED');
  });
});

describe('SessionState type', () => {
  it('can be constructed with all required fields', () => {
    const state: SessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      current_step: VerificationStatus.AWAITING_FRONT,
      rejection_reason: null,
      rejection_detail: null,
      front_extraction: null,
      back_extraction: null,
      cross_validation: null,
      face_match: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    expect(state.session_id).toBeDefined();
    expect(state.current_step).toBe(VerificationStatus.AWAITING_FRONT);
  });
});
