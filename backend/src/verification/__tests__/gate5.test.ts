import { describe, it, expect } from 'vitest';
import { evaluateGate5 } from '../gates/gate5-faceMatch.js';
import type { FaceMatchResult } from '@idswyft/shared';

function makeFaceMatchResult(overrides: Partial<FaceMatchResult> = {}): FaceMatchResult {
  return {
    similarity_score: 0.78,
    passed: true,
    threshold_used: 0.60,
    ...overrides,
  };
}

describe('Gate 5 — Face Match', () => {
  it('PASSES when similarity >= threshold', () => {
    const result = evaluateGate5(makeFaceMatchResult({ similarity_score: 0.75, passed: true }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS with FACE_MATCH_FAILED when similarity < threshold', () => {
    const result = evaluateGate5(makeFaceMatchResult({
      similarity_score: 0.40,
      passed: false,
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FACE_MATCH_FAILED');
  });

  // Boundary tests at default 0.60 threshold
  it('FAILS at similarity 0.59', () => {
    const result = evaluateGate5(makeFaceMatchResult({ similarity_score: 0.59, passed: false }));
    expect(result.passed).toBe(false);
  });

  it('PASSES at similarity 0.60', () => {
    const result = evaluateGate5(makeFaceMatchResult({ similarity_score: 0.60, passed: true }));
    expect(result.passed).toBe(true);
  });

  it('PASSES at similarity 1.0 (identical)', () => {
    const result = evaluateGate5(makeFaceMatchResult({ similarity_score: 1.0, passed: true }));
    expect(result.passed).toBe(true);
  });

  it('provides user_message on failure', () => {
    const result = evaluateGate5(makeFaceMatchResult({ similarity_score: 0.30, passed: false }));
    expect(result.user_message).toBeTruthy();
  });

  it('includes threshold_used in rejection_detail', () => {
    const result = evaluateGate5(makeFaceMatchResult({
      similarity_score: 0.30,
      passed: false,
      threshold_used: 0.60,
    }));
    expect(result.rejection_detail).toContain('0.60');
  });
});
