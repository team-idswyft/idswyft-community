/**
 * Voice Match Service — Deterministic cosine similarity for speaker verification.
 *
 * Reuses the same cosine similarity function from face matching.
 * Thresholds: 0.55 production, 0.50 sandbox.
 */

import { cosineSimilarity } from '../face/faceMatchService.js';
import type { VoiceMatchResult } from '@idswyft/shared';

/**
 * Compute voice match result from enrollment and verification embeddings.
 * Pure function — no side effects.
 *
 * @param enrollmentEmbedding  Speaker embedding from enrollment (512D)
 * @param verificationEmbedding  Speaker embedding from verification audio (512D)
 * @param threshold  Cosine similarity threshold (0.55 prod, 0.50 sandbox)
 * @param challengeVerified  Whether the spoken digits matched the challenge
 * @param challengeDigits  The expected challenge digits string
 */
export function computeVoiceMatch(
  enrollmentEmbedding: number[],
  verificationEmbedding: number[],
  threshold: number,
  challengeVerified: boolean,
  challengeDigits: string,
): VoiceMatchResult {
  const similarity = cosineSimilarity(enrollmentEmbedding, verificationEmbedding);

  return {
    similarity_score: similarity,
    passed: similarity >= threshold && challengeVerified,
    threshold_used: threshold,
    challenge_verified: challengeVerified,
    challenge_digits: challengeDigits,
  };
}
