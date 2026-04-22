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
 * Consecutive identical digits are avoided to reduce ASR confusion
 * (e.g., ASR may merge "2 2 2" into "222" and drop or duplicate a digit).
 * @param length Number of digits (default: 6)
 * @returns Space-separated digit string, e.g., "3 7 1 9 0 5"
 */
export function generateVoiceChallenge(length = 6): string {
  const digits: number[] = [];
  for (let i = 0; i < length; i++) {
    let d: number;
    do {
      d = randomInt(0, 10);
    } while (digits.length > 0 && d === digits[digits.length - 1]);
    digits.push(d);
  }
  return digits.join(' ');
}

/**
 * Verify that a transcription matches the expected challenge digits.
 *
 * Normalizes both strings to digit-only form before comparison.
 * Handles common ASR outputs:
 *   - Digit strings: "3 7 1 9 0 5" or "3, 7, 1, 9, 0, 5"
 *   - Spoken words:  "three seven one nine zero five"
 *   - Compound numbers: "thirty-seven nineteen oh five" (ASR may group digits)
 *   - Mixed:         "three 7 one 9 0 five"
 */
export function verifyChallengeTranscription(transcription: string, expected: string): boolean {
  const normalizeDigits = (s: string): string => {
    let normalized = s.toLowerCase().trim();

    // 1. Compound tens-units: "twenty-one" / "twenty one" → "21"
    const tensWords: Record<string, string> = {
      twenty: '2', thirty: '3', forty: '4', fifty: '5',
      sixty: '6', seventy: '7', eighty: '8', ninety: '9',
    };
    const onesWords: Record<string, string> = {
      one: '1', two: '2', three: '3', four: '4', five: '5',
      six: '6', seven: '7', eight: '8', nine: '9',
    };
    const tensPattern = Object.keys(tensWords).join('|');
    const onesPattern = Object.keys(onesWords).join('|');
    normalized = normalized.replace(
      new RegExp(`\\b(${tensPattern})[-\\s]?(${onesPattern})\\b`, 'g'),
      (_, t, o) => `${tensWords[t]}${onesWords[o]}`,
    );

    // 2. Standalone tens: "twenty" → "20", "thirty" → "30"
    for (const [word, digit] of Object.entries(tensWords)) {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), `${digit}0`);
    }

    // 3. Teens: "eleven" → "11", "twelve" → "12", etc.
    const teenMap: Record<string, string> = {
      ten: '10', eleven: '11', twelve: '12', thirteen: '13',
      fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
      eighteen: '18', nineteen: '19',
    };
    for (const [word, digits] of Object.entries(teenMap)) {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), digits);
    }

    // 4. Single digit words (must come after compound/teen handling)
    const wordMap: Record<string, string> = {
      zero: '0', oh: '0', o: '0',
      one: '1', two: '2', three: '3', four: '4', five: '5',
      six: '6', seven: '7', eight: '8', nine: '9',
    };
    for (const [word, digit] of Object.entries(wordMap)) {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
    }

    // 5. "double X" → "XX" (ASR sometimes outputs "double five" for "55")
    normalized = normalized.replace(/\bdouble\s*(\d)/g, '$1$1');
    normalized = normalized.replace(/\btriple\s*(\d)/g, '$1$1$1');

    // Strip everything except digits
    return normalized.replace(/\D/g, '');
  };

  const transcribedDigits = normalizeDigits(transcription);
  const expectedDigits = normalizeDigits(expected);

  if (transcribedDigits === expectedDigits) return true;

  // Allow at most 1 substitution (same length, 1 digit differs).
  // Does NOT tolerate missing or extra digits — only ASR mishearing a single digit.
  if (transcribedDigits.length !== expectedDigits.length) return false;
  let mismatches = 0;
  for (let i = 0; i < transcribedDigits.length; i++) {
    if (transcribedDigits[i] !== expectedDigits[i]) mismatches++;
    if (mismatches > 1) return false;
  }
  return true;
}
