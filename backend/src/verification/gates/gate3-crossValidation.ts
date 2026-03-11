/**
 * Gate 3 — Cross-Validation
 *
 * FAIL if:
 *   - Document expired
 *   - Any critical field failed comparison
 *   - Overall weighted score < 0.75 (THRESHOLD_REVIEW)
 *
 * PASS if:
 *   - Score >= 0.92 → PASS
 *   - Score >= 0.75 → REVIEW (still passes gate, flags for human review)
 */

import type { CrossValidationResult, GateResult } from '../models/types.js';

export function evaluateGate3(crossVal: CrossValidationResult): GateResult {
  // Document expired takes priority
  if (crossVal.document_expired) {
    return {
      passed: false,
      rejection_reason: 'DOCUMENT_EXPIRED',
      rejection_detail: `Document expiry date is in the past`,
      user_message: 'Your document has expired. Please use a valid, non-expired ID.',
    };
  }

  // Critical field failure
  if (crossVal.has_critical_failure) {
    return {
      passed: false,
      rejection_reason: 'CROSS_VALIDATION_FAILED',
      rejection_detail: `Critical field mismatch detected (score: ${crossVal.overall_score.toFixed(2)})`,
      user_message: 'The information on the front and back of your document does not match. Please ensure both images are from the same ID.',
    };
  }

  // Score below REVIEW threshold → REJECT
  if (crossVal.verdict === 'REJECT') {
    return {
      passed: false,
      rejection_reason: 'CROSS_VALIDATION_FAILED',
      rejection_detail: `Overall cross-validation score ${crossVal.overall_score.toFixed(2)} below review threshold`,
      user_message: 'We could not verify the consistency of your document. Please retake both sides of your ID.',
    };
  }

  // PASS or REVIEW both pass the gate (REVIEW flags for human review but doesn't block)
  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
