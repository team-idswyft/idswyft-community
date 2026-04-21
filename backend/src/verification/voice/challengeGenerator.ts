/**
 * Voice Challenge Generator — Random digit sequences for anti-spoofing.
 *
 * Generates a space-separated string of random digits (e.g., "3 7 1 9 0 5")
 * that the user must speak aloud. The transcription is then compared to
 * verify the person is actually speaking (not replaying audio).
 */

import { randomInt } from 'crypto';

/**
 * Generate a random digit challenge string.
 * @param length Number of digits (default: 6)
 * @returns Space-separated digit string, e.g., "3 7 1 9 0 5"
 */
export function generateVoiceChallenge(length = 6): string {
  const digits: number[] = [];
  for (let i = 0; i < length; i++) {
    digits.push(randomInt(0, 10));
  }
  return digits.join(' ');
}

/**
 * Verify that a transcription matches the expected challenge digits.
 *
 * Normalizes both strings to digit-only form before comparison.
 * Handles common ASR outputs like "three seven one" → "371" or "3, 7, 1" → "371".
 */
export function verifyChallengeTranscription(transcription: string, expected: string): boolean {
  const normalizeDigits = (s: string): string => {
    // First, convert spoken number words to digits
    const wordMap: Record<string, string> = {
      zero: '0', oh: '0', o: '0',
      one: '1', two: '2', three: '3', four: '4', five: '5',
      six: '6', seven: '7', eight: '8', nine: '9',
    };

    let normalized = s.toLowerCase();
    for (const [word, digit] of Object.entries(wordMap)) {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
    }

    // Strip everything except digits
    return normalized.replace(/\D/g, '');
  };

  const transcribedDigits = normalizeDigits(transcription);
  const expectedDigits = normalizeDigits(expected);

  return transcribedDigits === expectedDigits;
}
