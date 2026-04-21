import { describe, it, expect } from 'vitest';
import { evaluateGate7 } from '../gates/gate7-voiceMatch.js';
import type { VoiceMatchResult } from '@idswyft/shared';

function makeVoiceMatchResult(overrides: Partial<VoiceMatchResult> = {}): VoiceMatchResult {
  return {
    similarity_score: 0.78,
    passed: true,
    threshold_used: 0.55,
    challenge_verified: true,
    challenge_digits: '3 7 1 9 0 5',
    ...overrides,
  };
}

describe('Gate 7 — Voice Match', () => {
  it('PASSES when voice match is null (voice auth disabled)', () => {
    const result = evaluateGate7(null);
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('PASSES when skipped_reason is set (first enrollment)', () => {
    const result = evaluateGate7(makeVoiceMatchResult({
      skipped_reason: 'first_enrollment',
    }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('PASSES when challenge verified and similarity >= threshold', () => {
    const result = evaluateGate7(makeVoiceMatchResult({
      similarity_score: 0.78,
      passed: true,
      challenge_verified: true,
    }));
    expect(result.passed).toBe(true);
    expect(result.rejection_reason).toBeNull();
  });

  it('FAILS with VOICE_CHALLENGE_FAILED when challenge not verified', () => {
    const result = evaluateGate7(makeVoiceMatchResult({
      similarity_score: 0.78,
      passed: false,
      challenge_verified: false,
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('VOICE_CHALLENGE_FAILED');
    expect(result.user_message).toBeTruthy();
  });

  it('FAILS with VOICE_MATCH_FAILED when similarity < threshold', () => {
    const result = evaluateGate7(makeVoiceMatchResult({
      similarity_score: 0.40,
      passed: false,
      challenge_verified: true,
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('VOICE_MATCH_FAILED');
    expect(result.user_message).toBeTruthy();
  });

  it('prioritizes challenge failure over voice match failure', () => {
    // Both challenge and voice fail — challenge check runs first
    const result = evaluateGate7(makeVoiceMatchResult({
      similarity_score: 0.40,
      passed: false,
      challenge_verified: false,
    }));
    expect(result.passed).toBe(false);
    expect(result.rejection_reason).toBe('VOICE_CHALLENGE_FAILED');
  });

  it('includes challenge digits in rejection_detail on challenge failure', () => {
    const result = evaluateGate7(makeVoiceMatchResult({
      passed: false,
      challenge_verified: false,
      challenge_digits: '1 2 3 4 5 6',
    }));
    expect(result.rejection_detail).toContain('1 2 3 4 5 6');
  });

  it('includes similarity and threshold in rejection_detail on match failure', () => {
    const result = evaluateGate7(makeVoiceMatchResult({
      similarity_score: 0.42,
      passed: false,
      challenge_verified: true,
      threshold_used: 0.55,
    }));
    expect(result.rejection_detail).toContain('0.42');
    expect(result.rejection_detail).toContain('0.55');
  });
});
