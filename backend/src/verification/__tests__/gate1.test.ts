import { describe, it, expect } from 'vitest';
import { evaluateGate1 } from '../gates/gate1-frontDocument.js';
import type { FrontExtractionResult } from '../models/types.js';

function makeFrontResult(overrides: Partial<FrontExtractionResult> = {}): FrontExtractionResult {
  return {
    ocr: {
      full_name: 'JOHN DOE',
      date_of_birth: '1990-01-15',
      id_number: 'AB1234567',
      expiry_date: '2030-12-31',
    },
    face_embedding: [0.1, 0.2, 0.3],
    face_confidence: 0.92,
    ocr_confidence: 0.87,
    mrz_from_front: null,
    ...overrides,
  };
}

describe('Gate 1 — Front Document Quality', () => {
  it('PASSES when all required fields present, OCR confidence high, face detected', () => {
    const result = evaluateGate1(makeFrontResult());
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS with FRONT_OCR_FAILED when full_name is missing', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('FAILS with FRONT_OCR_FAILED when id_number is missing', () => {
    const input = makeFrontResult();
    (input.ocr as any).id_number = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('FAILS with FRONT_OCR_FAILED when date_of_birth is missing', () => {
    const input = makeFrontResult();
    (input.ocr as any).date_of_birth = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('FAILS with FRONT_OCR_FAILED when expiry_date is missing', () => {
    const input = makeFrontResult();
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('FAILS with FRONT_LOW_CONFIDENCE when OCR confidence < 0.60', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.59 }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_LOW_CONFIDENCE');
  });

  it('PASSES when OCR confidence is exactly 0.60', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.60 }));
    expect(result.passed).toBe(true);
  });

  it('FAILS with FRONT_OCR_FAILED when no face detected (face_confidence < 0.45)', () => {
    const result = evaluateGate1(makeFrontResult({ face_confidence: 0.10, face_embedding: null }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('PASSES when face_confidence exactly at threshold (0.45)', () => {
    const result = evaluateGate1(makeFrontResult({ face_confidence: 0.45 }));
    expect(result.passed).toBe(true);
  });

  it('provides a user_message on failure', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.30 }));
    expect(result.passed).toBe(false);
    expect(result.user_message).toBeTruthy();
    expect(typeof result.user_message).toBe('string');
  });

  it('provides rejection_detail for audit on failure', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.30 }));
    expect(result.rejection_detail).toBeTruthy();
  });
});
