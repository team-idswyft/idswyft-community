/**
 * Gate 5 — Face Match
 *
 * FAIL if:
 *   - Face similarity score < threshold (default 0.60)
 *
 * PASS if similarity >= threshold → VERIFICATION SUCCESS.
 */

import type { FaceMatchResult, GateResult } from '../models/types.js';

export function evaluateGate5(faceMatch: FaceMatchResult): GateResult {
  if (!faceMatch.passed) {
    return {
      passed: false,
      rejection_reason: 'FACE_MATCH_FAILED',
      rejection_detail: `Face similarity ${faceMatch.similarity_score.toFixed(2)} below threshold ${faceMatch.threshold_used.toFixed(2)}`,
      user_message: 'Your selfie does not match the photo on your ID. Please try again.',
    };
  }

  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
