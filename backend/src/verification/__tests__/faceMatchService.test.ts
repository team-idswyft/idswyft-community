import { describe, it, expect } from 'vitest';
import { cosineSimilarity, computeFaceMatch } from '../face/faceMatchService.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [0.5, 0.3, 0.8, 0.1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns value between 0 and 1 for similar vectors', () => {
    const a = [0.5, 0.3, 0.8];
    const b = [0.6, 0.2, 0.9];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.9);
    expect(sim).toBeLessThanOrEqual(1.0);
  });

  it('handles zero vectors safely (returns 0)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('is symmetric', () => {
    const a = [0.1, 0.5, 0.3];
    const b = [0.4, 0.2, 0.7];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});

describe('computeFaceMatch', () => {
  it('returns passed=true when similarity >= threshold', () => {
    const identical = [0.5, 0.3, 0.8, 0.1];
    const result = computeFaceMatch(identical, identical, 0.60);
    expect(result.passed).toBe(true);
    expect(result.similarity_score).toBeCloseTo(1.0, 2);
    expect(result.threshold_used).toBe(0.60);
  });

  it('returns passed=false when similarity < threshold', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    const result = computeFaceMatch(a, b, 0.60);
    expect(result.passed).toBe(false);
    expect(result.similarity_score).toBeCloseTo(0.0, 2);
  });

  it('clamps negative similarities to 0', () => {
    // Opposite direction vectors can produce negative cosine similarity
    const a = [1, 0];
    const b = [-1, 0];
    const result = computeFaceMatch(a, b, 0.60);
    expect(result.similarity_score).toBeGreaterThanOrEqual(0);
  });

  it('uses the provided threshold correctly at boundary', () => {
    // Two slightly different vectors with known similarity
    const a = [1, 0, 0];
    const b = [0.9, 0.436, 0]; // cosine with [1,0,0] ≈ 0.9 / 1.0 ≈ 0.90
    const sim = cosineSimilarity(a, b);

    const resultPass = computeFaceMatch(a, b, sim - 0.01);
    expect(resultPass.passed).toBe(true);

    const resultFail = computeFaceMatch(a, b, sim + 0.01);
    expect(resultFail.passed).toBe(false);
  });
});
