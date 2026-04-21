/**
 * Gate 7 — Voice Match
 *
 * FAIL if:
 *   - Challenge transcription doesn't match expected digits (anti-spoofing)
 *   - Speaker similarity score < threshold (speaker verification)
 *
 * PASS if:
 *   - Voice match is null (voice auth disabled — gate skipped)
 *   - Voice match has a skipped_reason (first enrollment — no comparison)
 *   - Both challenge verified AND similarity >= threshold
 */

import type { VoiceMatchResult, GateResult } from '@idswyft/shared';

export function evaluateGate7(voiceMatch: VoiceMatchResult | null): GateResult {
  // Voice auth not configured or skipped
  if (!voiceMatch) {
    return {
      passed: true,
      rejection_reason: null,
      rejection_detail: null,
      user_message: null,
    };
  }

  // First enrollment — no previous embedding to compare against
  if (voiceMatch.skipped_reason) {
    return {
      passed: true,
      rejection_reason: null,
      rejection_detail: null,
      user_message: null,
    };
  }

  // Challenge verification failed — anti-spoofing check
  if (!voiceMatch.challenge_verified) {
    return {
      passed: false,
      rejection_reason: 'VOICE_CHALLENGE_FAILED',
      rejection_detail: `Spoken digits did not match expected challenge "${voiceMatch.challenge_digits}"`,
      user_message: 'The spoken digits did not match the challenge. Please try again.',
    };
  }

  // Speaker similarity too low
  if (!voiceMatch.passed) {
    return {
      passed: false,
      rejection_reason: 'VOICE_MATCH_FAILED',
      rejection_detail: `Voice similarity ${voiceMatch.similarity_score.toFixed(2)} below threshold ${voiceMatch.threshold_used.toFixed(2)}`,
      user_message: 'Voice verification failed. Your voice does not match the enrollment recording.',
    };
  }

  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
