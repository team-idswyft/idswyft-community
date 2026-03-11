/**
 * Gate 4 — Liveness
 *
 * FAIL if:
 *   - Liveness check failed (anti-spoofing)
 *   - No face detected in live capture (low confidence AND no embedding)
 *
 * PASS if liveness passed and face is detected (embedding present OR confidence > 0.5).
 *
 * Note: Face embeddings require TensorFlow (optional dependency).
 * When TF isn't available, face_confidence from detectFacePresence()
 * is the only signal. Gate 4 passes on confidence alone; Gate 5
 * handles the missing-embedding case separately.
 */

import type { LiveCaptureResult, GateResult } from '../models/types.js';

const FACE_CONFIDENCE_THRESHOLD = 0.5;

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

  // Face detection: pass if embedding exists OR confidence is high enough.
  // Embedding extraction requires TensorFlow which is optional;
  // detectFacePresence() returns a confidence score even without TF.
  const hasEmbedding = liveCapture.face_embedding && liveCapture.face_embedding.length > 0;
  const hasHighConfidence = liveCapture.face_confidence >= FACE_CONFIDENCE_THRESHOLD;

  if (!hasEmbedding && !hasHighConfidence) {
    return {
      passed: false,
      rejection_reason: 'FACE_NOT_DETECTED',
      rejection_detail: `No face detected in live capture (confidence: ${liveCapture.face_confidence.toFixed(2)}, threshold: ${FACE_CONFIDENCE_THRESHOLD})`,
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
