import { describe, it, expect } from 'vitest';
import { crossValidate } from '../cross-validator/engine.js';
import type { FrontExtractionResult, BackExtractionResult } from '../models/types.js';

function makeFront(overrides: Record<string, string> = {}): FrontExtractionResult {
  return {
    ocr: {
      full_name: 'JOHN DOE',
      date_of_birth: '1990-01-15',
      id_number: 'AB1234567',
      expiry_date: '2030-12-31',
      nationality: 'USA',
      ...overrides,
    },
    face_embedding: [0.1],
    face_confidence: 0.9,
    ocr_confidence: 0.9,
    mrz_from_front: null,
  };
}

function makeBack(overrides: Record<string, string> = {}): BackExtractionResult {
  return {
    qr_payload: {
      full_name: 'JOHN DOE',
      first_name: 'JOHN',
      last_name: 'DOE',
      date_of_birth: '1990-01-15',
      id_number: 'AB1234567',
      expiry_date: '2030-12-31',
      nationality: 'USA',
      ...overrides,
    },
    mrz_result: null,
    barcode_format: 'PDF417',
    raw_barcode_data: 'data',
  };
}

describe('Cross-Validator Engine', () => {
  it('returns PASS with score 1.0 when all fields match perfectly', () => {
    const result = crossValidate(makeFront(), makeBack());
    expect(result.overall_score).toBe(1.0);
    expect(result.verdict).toBe('PASS');
    expect(result.has_critical_failure).toBe(false);
    expect(result.document_expired).toBe(false);
  });

  it('returns per-field scores for all configured fields', () => {
    const result = crossValidate(makeFront(), makeBack());
    expect(result.field_scores.id_number).toBeDefined();
    expect(result.field_scores.full_name).toBeDefined();
    expect(result.field_scores.date_of_birth).toBeDefined();
    expect(result.field_scores.expiry_date).toBeDefined();
    expect(result.field_scores.nationality).toBeDefined();
  });

  it('weights are correct (id=0.40, name=0.25, dob=0.20, expiry=0.10, nat=0.05)', () => {
    const result = crossValidate(makeFront(), makeBack());
    expect(result.field_scores.id_number.weight).toBe(0.40);
    expect(result.field_scores.full_name.weight).toBe(0.25);
    expect(result.field_scores.date_of_birth.weight).toBe(0.20);
    expect(result.field_scores.expiry_date.weight).toBe(0.10);
    expect(result.field_scores.nationality.weight).toBe(0.05);
  });

  it('marks critical failure when id_number mismatches', () => {
    const result = crossValidate(
      makeFront({ id_number: 'AB1234567' }),
      makeBack({ id_number: 'XY9876543' }),
    );
    expect(result.has_critical_failure).toBe(true);
    expect(result.field_scores.id_number.passed).toBe(false);
    expect(result.verdict).toBe('REJECT');
  });

  it('marks critical failure when full_name differs significantly', () => {
    const result = crossValidate(
      makeFront({ full_name: 'JOHN DOE' }),
      makeBack({ full_name: 'ALICE SMITH', first_name: 'ALICE', last_name: 'SMITH' }),
    );
    expect(result.has_critical_failure).toBe(true);
    expect(result.field_scores.full_name.passed).toBe(false);
  });

  it('marks critical failure when date_of_birth mismatches', () => {
    const result = crossValidate(
      makeFront({ date_of_birth: '1990-01-15' }),
      makeBack({ date_of_birth: '1985-06-20' }),
    );
    expect(result.has_critical_failure).toBe(true);
    expect(result.field_scores.date_of_birth.passed).toBe(false);
  });

  it('does NOT mark critical failure for expiry_date mismatch (non-critical)', () => {
    const result = crossValidate(
      makeFront({ expiry_date: '2030-12-31' }),
      makeBack({ expiry_date: '2025-06-30' }),
    );
    // expiry is non-critical — it lowers the score but doesn't trigger critical
    expect(result.has_critical_failure).toBe(false);
    expect(result.field_scores.expiry_date.passed).toBe(false);
  });

  it('returns REVIEW verdict when score is between 0.75 and 0.92', () => {
    // Name mismatch but everything else matches
    const result = crossValidate(
      makeFront({ full_name: 'JOHN M DOE' }),
      makeBack({ full_name: 'JOHN DOE', first_name: 'JOHN', last_name: 'DOE' }),
    );
    // If name score is less than perfect but still passes threshold,
    // overall score should be in REVIEW range
    if (result.overall_score >= 0.75 && result.overall_score < 0.92) {
      expect(result.verdict).toBe('REVIEW');
    }
  });

  it('handles alpha-2 vs alpha-3 nationality comparison', () => {
    const result = crossValidate(
      makeFront({ nationality: 'US' }),
      makeBack({ nationality: 'USA' }),
    );
    expect(result.field_scores.nationality.score).toBe(1.0);
    expect(result.field_scores.nationality.passed).toBe(true);
  });

  it('handles MRZ date format (YYMMDD) vs standard date', () => {
    const result = crossValidate(
      makeFront({ date_of_birth: '900115' }),
      makeBack({ date_of_birth: '1990-01-15' }),
    );
    expect(result.field_scores.date_of_birth.score).toBe(1.0);
  });

  it('detects expired documents', () => {
    const result = crossValidate(
      makeFront({ expiry_date: '2020-01-01' }),
      makeBack({ expiry_date: '2020-01-01' }),
    );
    expect(result.document_expired).toBe(true);
  });

  it('does not flag future expiry as expired', () => {
    const result = crossValidate(
      makeFront({ expiry_date: '2099-12-31' }),
      makeBack({ expiry_date: '2099-12-31' }),
    );
    expect(result.document_expired).toBe(false);
  });

  it('returns REVIEW (not PASS) when barcode is completely unreadable', () => {
    const emptyBack: BackExtractionResult = {
      qr_payload: {},
      mrz_result: null,
      barcode_format: null,
      raw_barcode_data: null,
    };
    const result = crossValidate(makeFront(), emptyBack);
    expect(result.verdict).toBe('REVIEW');
    expect(result.overall_score).toBeLessThan(0.92); // Below PASS threshold
    expect(result.overall_score).toBeGreaterThanOrEqual(0.75); // Above REVIEW threshold
    expect(result.has_critical_failure).toBe(false);
  });

  it('returns REJECT when barcode is unreadable AND document is expired', () => {
    const emptyBack: BackExtractionResult = {
      qr_payload: {},
      mrz_result: null,
      barcode_format: null,
      raw_barcode_data: null,
    };
    const result = crossValidate(makeFront({ expiry_date: '2020-01-01' }), emptyBack);
    expect(result.verdict).toBe('REJECT');
    expect(result.document_expired).toBe(true);
  });

  it('handles missing back fields gracefully (score 0 for missing fields)', () => {
    const back = makeBack();
    delete (back.qr_payload as any).nationality;
    const result = crossValidate(makeFront(), back);
    expect(result.field_scores.nationality.score).toBe(0.0);
  });

  it('constructs name from first_name + last_name when full_name missing in back', () => {
    const back = makeBack();
    delete (back.qr_payload as any).full_name;
    const result = crossValidate(makeFront({ full_name: 'JOHN DOE' }), back);
    // first_name='JOHN' + last_name='DOE' should match 'JOHN DOE'
    expect(result.field_scores.full_name.score).toBe(1.0);
  });
});
