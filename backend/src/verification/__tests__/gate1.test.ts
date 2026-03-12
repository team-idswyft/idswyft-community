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
  it('PASSES when all desired fields present, OCR confidence high, face detected', () => {
    const result = evaluateGate1(makeFrontResult());
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  // ── Lenient OCR: single missing field should still pass ──────────────

  it('PASSES (soft) when full_name is missing but other fields present', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(true);
  });

  it('PASSES (soft) when date_of_birth is missing but other fields present', () => {
    const input = makeFrontResult();
    (input.ocr as any).date_of_birth = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(true);
  });

  it('PASSES (soft) when expiry_date is missing but other fields present', () => {
    const input = makeFrontResult();
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(true);
  });

  // ── Hard reject when NO fields are readable ──────────────────────────

  it('FAILS with FRONT_OCR_FAILED when ALL fields are empty', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = '';
    (input.ocr as any).date_of_birth = '';
    (input.ocr as any).id_number = '';
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  // ── Noise detection: document headers should not count as valid names ─

  it('treats "DRIVER LICENSE" as noise for full_name field', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = 'DRIVER LICENSE';
    (input.ocr as any).date_of_birth = '';
    (input.ocr as any).expiry_date = '';
    // Only id_number remains → should still pass (1 field present)
    const result = evaluateGate1(input);
    expect(result.passed).toBe(true);
  });

  it('FAILS when full_name is noise AND all other fields empty', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = 'DRIVER LICENSE';
    (input.ocr as any).date_of_birth = '';
    (input.ocr as any).id_number = '';
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  it('treats partial header match "CAROLINA SA DRIVER LICENSE" as noise for full_name', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = 'CAROLINA SA DRIVER LICENSE';
    // Other fields still present → passes (noise name is just ignored)
    const result = evaluateGate1(input);
    expect(result.passed).toBe(true);
  });

  it('FAILS when full_name is partial-noise AND all other fields empty', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = 'CAROLINA SA DRIVER LICENSE';
    (input.ocr as any).date_of_birth = '';
    (input.ocr as any).id_number = '';
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_OCR_FAILED');
  });

  // ── OCR confidence (hard reject) ──────────────────────────────────

  it('FAILS with FRONT_LOW_CONFIDENCE when OCR confidence < 0.60', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.59 }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_LOW_CONFIDENCE');
    expect(result.user_message).toBeTruthy();
  });

  it('FAILS with FRONT_LOW_CONFIDENCE when OCR confidence is very low (0.35)', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.35 }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FRONT_LOW_CONFIDENCE');
    expect(result.rejection_detail).toContain('0.35');
  });

  it('PASSES when OCR confidence is exactly 0.60 (boundary)', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.60 }));
    expect(result.passed).toBe(true);
  });

  it('PASSES when OCR confidence is above threshold (0.75)', () => {
    const result = evaluateGate1(makeFrontResult({ ocr_confidence: 0.75 }));
    expect(result.passed).toBe(true);
  });

  // ── Face detection (soft check) ─────────────────────────────────────

  it('PASSES (soft check) when no face detected — face match deferred to Gate 5', () => {
    const result = evaluateGate1(makeFrontResult({ face_confidence: 0.10, face_embedding: null }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('PASSES when face_confidence exactly at threshold (0.45)', () => {
    const result = evaluateGate1(makeFrontResult({ face_confidence: 0.45 }));
    expect(result.passed).toBe(true);
  });

  // ── User feedback ──────────────────────────────────────────────────

  it('provides a user_message on failure (zero fields)', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = '';
    (input.ocr as any).date_of_birth = '';
    (input.ocr as any).id_number = '';
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.passed).toBe(false);
    expect(result.user_message).toBeTruthy();
    expect(typeof result.user_message).toBe('string');
  });

  it('provides rejection_detail for audit on failure', () => {
    const input = makeFrontResult();
    (input.ocr as any).full_name = '';
    (input.ocr as any).date_of_birth = '';
    (input.ocr as any).id_number = '';
    (input.ocr as any).expiry_date = '';
    const result = evaluateGate1(input);
    expect(result.rejection_detail).toBeTruthy();
  });
});
