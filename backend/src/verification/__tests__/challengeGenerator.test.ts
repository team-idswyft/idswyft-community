import { describe, it, expect } from 'vitest';
import { generateVoiceChallenge, verifyChallengeTranscription } from '../voice/challengeGenerator.js';

describe('generateVoiceChallenge', () => {
  it('returns space-separated digits of requested length', () => {
    const challenge = generateVoiceChallenge(6);
    const parts = challenge.split(' ');
    expect(parts).toHaveLength(6);
    for (const p of parts) {
      expect(Number(p)).toBeGreaterThanOrEqual(0);
      expect(Number(p)).toBeLessThanOrEqual(9);
    }
  });

  it('defaults to 6 digits', () => {
    const challenge = generateVoiceChallenge();
    expect(challenge.split(' ')).toHaveLength(6);
  });

  it('respects custom length', () => {
    expect(generateVoiceChallenge(3).split(' ')).toHaveLength(3);
    expect(generateVoiceChallenge(10).split(' ')).toHaveLength(10);
  });

  it('produces different challenges (non-deterministic)', () => {
    // Run multiple times — should not always be identical
    const challenges = new Set<string>();
    for (let i = 0; i < 20; i++) {
      challenges.add(generateVoiceChallenge(6));
    }
    expect(challenges.size).toBeGreaterThan(1);
  });

  it('never produces consecutive identical digits', () => {
    for (let i = 0; i < 100; i++) {
      const challenge = generateVoiceChallenge(6);
      const digits = challenge.split(' ');
      for (let j = 1; j < digits.length; j++) {
        expect(digits[j]).not.toBe(digits[j - 1]);
      }
    }
  });
});

describe('verifyChallengeTranscription', () => {
  it('matches exact digit strings', () => {
    expect(verifyChallengeTranscription('3 7 1 9 0 5', '3 7 1 9 0 5')).toBe(true);
  });

  it('matches when spaces differ', () => {
    expect(verifyChallengeTranscription('371905', '3 7 1 9 0 5')).toBe(true);
  });

  it('matches with commas and punctuation', () => {
    expect(verifyChallengeTranscription('3, 7, 1, 9, 0, 5', '3 7 1 9 0 5')).toBe(true);
  });

  it('matches spoken number words', () => {
    expect(verifyChallengeTranscription('three seven one nine zero five', '3 7 1 9 0 5')).toBe(true);
  });

  it('handles "oh" as zero', () => {
    expect(verifyChallengeTranscription('three seven one nine oh five', '3 7 1 9 0 5')).toBe(true);
  });

  it('handles "o" as zero', () => {
    expect(verifyChallengeTranscription('three seven one nine o five', '3 7 1 9 0 5')).toBe(true);
  });

  it('handles mixed words and digits', () => {
    expect(verifyChallengeTranscription('three 7 one 9 0 five', '3 7 1 9 0 5')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(verifyChallengeTranscription('Three SEVEN One', '3 7 1')).toBe(true);
  });

  it('tolerates 1 wrong digit (single substitution)', () => {
    expect(verifyChallengeTranscription('3 7 1 9 0 6', '3 7 1 9 0 5')).toBe(true);
  });

  it('rejects missing digits', () => {
    expect(verifyChallengeTranscription('3 7 1 9 0', '3 7 1 9 0 5')).toBe(false);
  });

  it('rejects extra digits', () => {
    expect(verifyChallengeTranscription('3 7 1 9 0 5 2', '3 7 1 9 0 5')).toBe(false);
  });

  it('rejects 2+ wrong digits', () => {
    expect(verifyChallengeTranscription('3 7 1 9 6 6', '3 7 1 9 0 5')).toBe(false);
  });

  it('rejects completely wrong input', () => {
    expect(verifyChallengeTranscription('hello world', '3 7 1 9 0 5')).toBe(false);
  });

  it('rejects empty transcription', () => {
    expect(verifyChallengeTranscription('', '3 7 1 9 0 5')).toBe(false);
  });

  // --- Compound number handling (ASR may group digits) ---
  it('handles compound tens-units: "fifty-one" → "51"', () => {
    // ASR might interpret "5 1" as "fifty-one"
    expect(verifyChallengeTranscription('fifty-one fifty-nine thirty-four', '5 1 5 9 3 4')).toBe(true);
  });

  it('handles compound with space: "fifty one" → "51"', () => {
    expect(verifyChallengeTranscription('fifty one fifty nine thirty four', '5 1 5 9 3 4')).toBe(true);
  });

  it('handles teens: "thirteen" → "13"', () => {
    expect(verifyChallengeTranscription('thirteen nineteen', '1 3 1 9')).toBe(true);
  });

  it('handles standalone tens: "twenty" → "20"', () => {
    expect(verifyChallengeTranscription('twenty thirty', '2 0 3 0')).toBe(true);
  });

  it('handles mixed compound and single digits', () => {
    // "fifty-one" + "five" + "nine" + "three" + "four"
    expect(verifyChallengeTranscription('fifty-one five nine thirty-four', '5 1 5 9 3 4')).toBe(true);
  });

  it('handles "double" prefix', () => {
    expect(verifyChallengeTranscription('double five three nine', '5 5 3 9')).toBe(true);
  });

  it('handles "triple" prefix', () => {
    expect(verifyChallengeTranscription('triple zero one', '0 0 0 1')).toBe(true);
  });

  it('handles ASR punctuation with period', () => {
    expect(verifyChallengeTranscription('3, 7, 1, 9, 0, 5.', '3 7 1 9 0 5')).toBe(true);
  });
});
