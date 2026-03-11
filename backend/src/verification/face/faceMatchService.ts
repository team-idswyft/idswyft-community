/**
 * Face Match Service — Deterministic cosine similarity.
 *
 * Computes cosine similarity between two face embeddings (128-d vectors
 * from @vladmandic/face-api). No AI/LLM involvement in the decision.
 */

import type { FaceMatchResult } from '../models/types.js';

/**
 * Compute cosine similarity between two vectors.
 * Returns value in range [0, 1] (clamped — negative similarities treated as 0).
 *
 * cosine_similarity = dot(a, b) / (||a|| * ||b||)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const similarity = dot / denominator;
  return Math.max(0, similarity); // Clamp negatives to 0
}

/**
 * Compute face match result from two embeddings and a threshold.
 * Pure function — no side effects.
 */
export function computeFaceMatch(
  idEmbedding: number[],
  liveEmbedding: number[],
  threshold: number,
): FaceMatchResult {
  const similarity = cosineSimilarity(idEmbedding, liveEmbedding);

  return {
    similarity_score: similarity,
    passed: similarity >= threshold,
    threshold_used: threshold,
  };
}
