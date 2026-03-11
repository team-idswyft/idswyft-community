/**
 * Gate 4 — Liveness
 *
 * FAIL if:
 *   - Liveness check failed (anti-spoofing)
 *   - No face detected in live capture (empty embedding)
 *
 * PASS if liveness passed and face embedding extracted.
 */

import type { LiveCaptureResult, GateResult } from '../models/types.js';

export function evaluateGate4(liveCapture: LiveCaptureResult): GateResult {
  // Liveness failure takes precedence
  if (!liveCapture.liveness_passed) {
    return {
      passed: false,
      rejection_reason: 'LIVENESS_FAILED',
      rejection_detail: `Liveness score ${liveCapture.liveness_score.toFixed(2)} — anti-spoofing check failed`,
      user_message: 'We could not verify that you are present. Please try again with a live photo, not a printed picture or screen.',
    };
  }

  // Face detection check
  if (!liveCapture.face_embedding || liveCapture.face_embedding.length === 0) {
    return {
      passed: false,
      rejection_reason: 'FACE_NOT_DETECTED',
      rejection_detail: `No face embedding extracted from live capture (confidence: ${liveCapture.face_confidence.toFixed(2)})`,
      user_message: 'We could not detect your face. Please ensure your face is clearly visible and well-lit.',
    };
  }

  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
