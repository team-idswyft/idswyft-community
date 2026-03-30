import { describe, it, expect } from 'vitest';
import { evaluateGate4 } from '../gates/gate4-liveCapture.js';
import type { LiveCaptureResult } from '@idswyft/shared';

function makeLiveCaptureResult(overrides: Partial<LiveCaptureResult> = {}): LiveCaptureResult {
  return {
    face_embedding: [0.1, 0.2, 0.3, 0.4],
    face_confidence: 0.95,
    liveness_passed: true,
    liveness_score: 0.88,
    ...overrides,
  };
}

describe('Gate 4 — Liveness', () => {
  it('PASSES when liveness passed and face detected', () => {
    const result = evaluateGate4(makeLiveCaptureResult());
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS with LIVENESS_FAILED when liveness_passed is false', () => {
    const result = evaluateGate4(makeLiveCaptureResult({ liveness_passed: false, liveness_score: 0.30 }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('LIVENESS_FAILED');
  });

  it('FAILS with FACE_NOT_DETECTED when confidence is low AND embedding is empty', () => {
    const result = evaluateGate4(makeLiveCaptureResult({
      face_confidence: 0.10,
      face_embedding: [],
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('FACE_NOT_DETECTED');
  });

  it('PASSES when face_embedding is empty but face_confidence is high', () => {
    // TensorFlow may not be installed, so embedding is empty,
    // but detectFacePresence() returned a high confidence score.
    const result = evaluateGate4(makeLiveCaptureResult({
      face_embedding: [],
      face_confidence: 0.77,
    }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('PASSES when face_embedding exists even with borderline confidence', () => {
    const result = evaluateGate4(makeLiveCaptureResult({
      face_embedding: [0.1, 0.2, 0.3],
      face_confidence: 0.40,
    }));
    expect(result.passed).toBe(true);
  });

  it('LIVENESS_FAILED takes precedence over FACE_NOT_DETECTED', () => {
    const result = evaluateGate4(makeLiveCaptureResult({
      liveness_passed: false,
      liveness_score: 0.20,
      face_confidence: 0.10,
      face_embedding: [],
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('LIVENESS_FAILED');
  });

  it('provides user_message on failure', () => {
    const result = evaluateGate4(makeLiveCaptureResult({ liveness_passed: false }));
    expect(result.user_message).toBeTruthy();
  });
});
