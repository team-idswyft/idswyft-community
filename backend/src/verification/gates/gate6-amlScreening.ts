/**
 * Gate 6 — AML/Sanctions Screening
 *
 * FAIL (hard reject) if:
 *   - Confirmed match on a sanctions list (score >= 0.85)
 *
 * REVIEW (route to manual review) if:
 *   - Potential match found (score >= 0.5 but < 0.85)
 *
 * PASS if:
 *   - No matches found (clear)
 *   - AML screening is disabled (provider returns null)
 *
 * This gate runs after Gate 5 (face match) and before COMPLETE.
 */

import type { GateResult } from '@idswyft/shared';
import type { AMLScreeningResult } from '@/providers/aml/types.js';

export function evaluateGate6(amlResult: AMLScreeningResult | null): GateResult {
  // AML not configured or unavailable — pass through
  if (!amlResult) {
    return {
      passed: true,
      rejection_reason: null,
      rejection_detail: null,
      user_message: null,
    };
  }

  if (amlResult.risk_level === 'confirmed_match') {
    const topMatch = amlResult.matches[0];
    return {
      passed: false,
      rejection_reason: 'AML_MATCH_FOUND',
      rejection_detail: `Confirmed sanctions list match: "${topMatch?.listed_name}" on ${topMatch?.list_source} (score: ${topMatch?.score.toFixed(2)})`,
      user_message: 'Verification could not be completed. Please contact support for assistance.',
    };
  }

  if (amlResult.risk_level === 'potential_match') {
    return {
      passed: false,
      rejection_reason: 'AML_POTENTIAL_MATCH',
      rejection_detail: `Potential sanctions list match found (${amlResult.matches.length} match(es)). Manual review required.`,
      user_message: 'Your verification requires additional review. You will be notified of the outcome.',
    };
  }

  // Clear — no matches
  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
