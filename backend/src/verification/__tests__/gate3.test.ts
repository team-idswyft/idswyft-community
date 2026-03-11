import { describe, it, expect } from 'vitest';
import { evaluateGate3 } from '../gates/gate3-crossValidation.js';
import type { CrossValidationResult } from '../models/types.js';

function makeCrossValResult(overrides: Partial<CrossValidationResult> = {}): CrossValidationResult {
  return {
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
    verdict: 'PASS',
    ...overrides,
  };
}

describe('Gate 3 — Cross-Validation', () => {
  it('PASSES when score >= 0.92 and no critical failures', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.92, verdict: 'PASS' }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('PASSES (with review flag) when score >= 0.75 but < 0.92', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.80, verdict: 'REVIEW' }));
    // Gate 3 still PASSES for REVIEW — live capture is unlocked, but flagged
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS when score < 0.75 (REJECT)', () => {
    const result = evaluateGate3(makeCrossValResult({
      overall_score: 0.74,
      verdict: 'REJECT',
      has_critical_failure: true,
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('CROSS_VALIDATION_FAILED');
  });

  // Boundary tests
  it('FAILS at exactly 0.74 (just below REVIEW threshold)', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.74, verdict: 'REJECT' }));
    expect(result.passed).toBe(false);
  });

  it('PASSES at exactly 0.75 (REVIEW threshold)', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.75, verdict: 'REVIEW' }));
    expect(result.passed).toBe(true);
  });

  it('PASSES at exactly 0.91 (still REVIEW)', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.91, verdict: 'REVIEW' }));
    expect(result.passed).toBe(true);
  });

  it('PASSES at exactly 0.92 (PASS threshold)', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.92, verdict: 'PASS' }));
    expect(result.passed).toBe(true);
  });

  it('FAILS when has_critical_failure is true regardless of score', () => {
    const result = evaluateGate3(makeCrossValResult({
      overall_score: 0.98,
      has_critical_failure: true,
      verdict: 'REJECT',
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('CROSS_VALIDATION_FAILED');
  });

  it('FAILS with DOCUMENT_EXPIRED when document is expired', () => {
    const result = evaluateGate3(makeCrossValResult({
      document_expired: true,
      verdict: 'REJECT',
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('DOCUMENT_EXPIRED');
  });

  it('DOCUMENT_EXPIRED takes precedence over CROSS_VALIDATION_FAILED', () => {
    const result = evaluateGate3(makeCrossValResult({
      overall_score: 0.50,
      has_critical_failure: true,
      document_expired: true,
      verdict: 'REJECT',
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('DOCUMENT_EXPIRED');
  });

  it('provides user_message on failure', () => {
    const result = evaluateGate3(makeCrossValResult({ overall_score: 0.50, verdict: 'REJECT' }));
    expect(result.user_message).toBeTruthy();
  });
});
