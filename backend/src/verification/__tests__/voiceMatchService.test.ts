import { describe, it, expect } from 'vitest';
import { computeVoiceMatch } from '../voice/voiceMatchService.js';

describe('computeVoiceMatch', () => {
  const identicalEmb = [0.5, 0.3, 0.8, 0.1, 0.6, 0.2];

  it('returns passed=true when similarity >= threshold and challenge verified', () => {
    const result = computeVoiceMatch(identicalEmb, identicalEmb, 0.55, true, '3 7 1');
    expect(result.passed).toBe(true);
    expect(result.similarity_score).toBeCloseTo(1.0, 2);
    expect(result.threshold_used).toBe(0.55);
    expect(result.challenge_verified).toBe(true);
    expect(result.challenge_digits).toBe('3 7 1');
  });

  it('returns passed=false when challenge not verified (even with matching voice)', () => {
    const result = computeVoiceMatch(identicalEmb, identicalEmb, 0.55, false, '3 7 1');
    expect(result.passed).toBe(false);
    expect(result.similarity_score).toBeCloseTo(1.0, 2);
    expect(result.challenge_verified).toBe(false);
  });

  it('returns passed=false when similarity < threshold (even with challenge verified)', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0]; // orthogonal — similarity ≈ 0
    const result = computeVoiceMatch(a, b, 0.55, true, '3 7 1');
    expect(result.passed).toBe(false);
    expect(result.similarity_score).toBeLessThan(0.55);
    expect(result.challenge_verified).toBe(true);
  });

  it('returns passed=false when both challenge and similarity fail', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    const result = computeVoiceMatch(a, b, 0.55, false, '3 7 1');
    expect(result.passed).toBe(false);
    expect(result.challenge_verified).toBe(false);
  });

  it('uses production threshold (0.55)', () => {
    const result = computeVoiceMatch(identicalEmb, identicalEmb, 0.55, true, '1 2 3');
    expect(result.threshold_used).toBe(0.55);
  });

  it('uses sandbox threshold (0.50)', () => {
    const result = computeVoiceMatch(identicalEmb, identicalEmb, 0.50, true, '1 2 3');
    expect(result.threshold_used).toBe(0.50);
  });

  it('preserves challenge_digits in result', () => {
    const result = computeVoiceMatch(identicalEmb, identicalEmb, 0.55, true, '9 8 7 6 5 4');
    expect(result.challenge_digits).toBe('9 8 7 6 5 4');
  });
});
