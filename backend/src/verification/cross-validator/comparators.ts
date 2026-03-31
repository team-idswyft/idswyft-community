/**
 * Per-field comparators for cross-validation.
 * Each takes two raw values, normalizes, and returns a score 0.0–1.0.
 */

import {
  normalizeIdNumber,
  normalizeName,
  normalizeDate,
  normalizeNationality,
} from './normalizers.js';
import { normalizeAddress } from '../address/addressNormalizer.js';

/**
 * Levenshtein distance-based similarity.
 * Extracted from NewVerificationEngine.ts:801-827.
 * Returns 1 - (editDistance / maxLength). Range: 0.0–1.0.
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,       // deletion
        matrix[j][i - 1] + 1,       // insertion
        matrix[j - 1][i - 1] + cost  // substitution
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Token-set similarity for name comparison.
 * Handles reordered name components (e.g., "DOE JOHN" vs "JOHN DOE").
 * Splits into tokens, sorts, then computes Levenshtein on rejoined strings.
 */
export function tokenSetSimilarity(str1: string, str2: string): number {
  const tokens1 = str1.split(/\s+/).filter(Boolean).sort();
  const tokens2 = str2.split(/\s+/).filter(Boolean).sort();

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const sorted1 = tokens1.join(' ');
  const sorted2 = tokens2.join(' ');

  return levenshteinSimilarity(sorted1, sorted2);
}

/**
 * Compare ID numbers.
 * Per spec: exact match → 1.0, >85% similar → 0.5 (OCR noise signal), else → 0.0
 */
export function compareIdNumber(front: string, back: string): number {
  const normFront = normalizeIdNumber(front);
  const normBack = normalizeIdNumber(back);

  if (!normFront || !normBack) return 0.0;
  if (normFront === normBack) return 1.0;

  const sim = levenshteinSimilarity(normFront, normBack);
  if (sim > 0.85) return 0.5; // OCR noise signal
  return 0.0;
}

/**
 * Token-subset similarity for name comparison.
 * When all tokens of the shorter name appear in the longer name, the extra
 * tokens are likely OCR noise or a middle name the barcode omitted.
 * Returns 0.95 for a full subset match, 0 otherwise.
 */
export function tokenSubsetSimilarity(str1: string, str2: string): number {
  const tokens1 = str1.split(/\s+/).filter(Boolean);
  const tokens2 = str2.split(/\s+/).filter(Boolean);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Determine which is shorter
  const [shorter, longer] = tokens1.length <= tokens2.length
    ? [tokens1, tokens2] : [tokens2, tokens1];

  // Every token in the shorter name must appear in the longer name
  const allPresent = shorter.every(token =>
    longer.some(t => t === token || levenshteinSimilarity(t, token) >= 0.85)
  );

  return allPresent ? 0.95 : 0;
}

/**
 * Compare full names.
 * Uses max of three strategies:
 *   1. Levenshtein similarity (handles typos)
 *   2. Token-set similarity (handles reordered names)
 *   3. Token-subset similarity (handles OCR injecting extra words)
 * Diacritics stripped before comparison.
 */
export function compareName(front: string, back: string): number {
  const normFront = normalizeName(front);
  const normBack = normalizeName(back);

  if (!normFront || !normBack) return 0.0;
  if (normFront === normBack) return 1.0;

  const levScore = levenshteinSimilarity(normFront, normBack);
  const tokenScore = tokenSetSimilarity(normFront, normBack);
  const subsetScore = tokenSubsetSimilarity(normFront, normBack);

  return Math.max(levScore, tokenScore, subsetScore);
}

/**
 * Compare dates.
 * Per spec: binary 1.0 or 0.0 after normalizing all formats to YYYY-MM-DD.
 */
export function compareDate(front: string, back: string): number {
  const normFront = normalizeDate(front);
  const normBack = normalizeDate(back);

  if (!normFront || !normBack) return 0.0;
  return normFront === normBack ? 1.0 : 0.0;
}

/**
 * Compare nationalities.
 * Per spec: handles alpha-2 vs alpha-3 (US = USA, GB = GBR).
 */
export function compareNationality(front: string, back: string): number {
  const normFront = normalizeNationality(front);
  const normBack = normalizeNationality(back);

  if (!normFront || !normBack) return 0.0;
  return normFront === normBack ? 1.0 : 0.0;
}

/**
 * Compare addresses using word-overlap scoring.
 * Normalizes abbreviations (Street→St, Avenue→Ave) then counts matching tokens.
 * Tokens match if one contains the other or Levenshtein distance <= 2.
 * Returns 0.0–1.0 (matched words / max words).
 */
export function compareAddress(front: string, back: string): number {
  const normFront = normalizeAddress(front);
  const normBack = normalizeAddress(back);

  if (!normFront || !normBack) return 0.0;
  if (normFront === normBack) return 1.0;

  const words1 = normFront.split(/\s+/).filter(w => w.length > 1);
  const words2 = normBack.split(/\s+/).filter(w => w.length > 1);

  const totalWords = Math.max(words1.length, words2.length);
  if (totalWords === 0) return 0.0;

  let matches = 0;
  const used = new Set<number>();

  for (const w1 of words1) {
    for (let j = 0; j < words2.length; j++) {
      if (used.has(j)) continue;
      const w2 = words2[j];
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1) || levenshteinSimilarity(w1, w2) >= 0.75) {
        matches++;
        used.add(j);
        break;
      }
    }
  }

  return matches / totalWords;
}
