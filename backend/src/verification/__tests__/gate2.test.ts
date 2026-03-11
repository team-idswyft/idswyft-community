import { describe, it, expect } from 'vitest';
import { evaluateGate2 } from '../gates/gate2-backDocument.js';
import type { BackExtractionResult, FrontExtractionResult } from '../models/types.js';

function makeBackResult(overrides: Partial<BackExtractionResult> = {}): BackExtractionResult {
  return {
    qr_payload: {
      first_name: 'JOHN',
      last_name: 'DOE',
      date_of_birth: '1990-01-15',
      id_number: 'AB1234567',
      expiry_date: '2030-12-31',
    },
    mrz_result: null,
    barcode_format: 'PDF417',
    raw_barcode_data: '@\n\x1e\rANSI636000090002...',
    ...overrides,
  };
}

function makeFrontResult(): FrontExtractionResult {
  return {
    ocr: {
      full_name: 'JOHN DOE',
      date_of_birth: '1990-01-15',
      id_number: 'AB1234567',
      expiry_date: '2030-12-31',
    },
    face_embedding: [0.1, 0.2],
    face_confidence: 0.92,
    ocr_confidence: 0.87,
    mrz_from_front: null,
  };
}

describe('Gate 2 — Back Document Integrity', () => {
  it('PASSES when barcode decoded and no MRZ issues', () => {
    const result = evaluateGate2(makeBackResult(), makeFrontResult());
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS with BACK_BARCODE_NOT_FOUND when qr_payload is null', () => {
    const result = evaluateGate2(makeBackResult({ qr_payload: null, barcode_format: null }), makeFrontResult());
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('BACK_BARCODE_NOT_FOUND');
  });

  it('PASSES when MRZ checksums are valid', () => {
    const back = makeBackResult({
      mrz_result: {
        raw_lines: ['P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AB12345671USA9001150M3012310<<<<<<<<<<<<<<00'],
        checksums_valid: true,
      },
    });
    const result = evaluateGate2(back, makeFrontResult());
    expect(result.passed).toBe(true);
  });

  it('FAILS with BACK_MRZ_CHECKSUM_FAILED when MRZ checksums are invalid', () => {
    const back = makeBackResult({
      mrz_result: {
        raw_lines: ['P<USADOE<<JOHN...', 'AB12345679USA9001150M3012310...'],
        checksums_valid: false,
      },
    });
    const result = evaluateGate2(back, makeFrontResult());
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('BACK_MRZ_CHECKSUM_FAILED');
  });

  it('FAILS with BACK_MRZ_BARCODE_MISMATCH when front MRZ and back MRZ disagree', () => {
    const front = makeFrontResult();
    front.mrz_from_front = ['P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AB12345671USA9001150M3012310<<<<<<<<<<<<<<00'];

    const back = makeBackResult({
      mrz_result: {
        raw_lines: ['P<USASMITH<<JANE<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'XY98765431USA8501150F2812310<<<<<<<<<<<<<<00'],
        checksums_valid: true,
        fields: { name: 'SMITH JANE', id_number: 'XY9876543' },
      },
    });

    const result = evaluateGate2(back, front);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('BACK_MRZ_BARCODE_MISMATCH');
  });

  it('PASSES when front has no MRZ (cannot mismatch)', () => {
    const front = makeFrontResult();
    front.mrz_from_front = null;

    const back = makeBackResult({
      mrz_result: {
        raw_lines: ['P<USADOE<<JOHN...'],
        checksums_valid: true,
      },
    });

    const result = evaluateGate2(back, front);
    expect(result.passed).toBe(true);
  });

  it('provides user_message on failure', () => {
    const result = evaluateGate2(makeBackResult({ qr_payload: null, barcode_format: null }), makeFrontResult());
    expect(result.user_message).toBeTruthy();
  });
});
