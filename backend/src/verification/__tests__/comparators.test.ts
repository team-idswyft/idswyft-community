import { describe, it, expect } from 'vitest';
import {
  compareIdNumber,
  compareName,
  compareDate,
  compareNationality,
  levenshteinSimilarity,
  tokenSetSimilarity,
} from '../cross-validator/comparators.js';

describe('levenshteinSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(levenshteinSimilarity('ABC', 'ABC')).toBe(1.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(levenshteinSimilarity('ABC', 'XYZ')).toBeCloseTo(0.0, 1);
  });

  it('returns correct ratio for one-character difference', () => {
    // "kitten" vs "sitten" -> distance 1, max len 6 -> 1 - 1/6 = 0.833
    expect(levenshteinSimilarity('kitten', 'sitten')).toBeCloseTo(0.833, 2);
  });

  it('handles empty strings', () => {
    expect(levenshteinSimilarity('', '')).toBe(1.0);
    expect(levenshteinSimilarity('abc', '')).toBe(0.0);
    expect(levenshteinSimilarity('', 'abc')).toBe(0.0);
  });

  it('is symmetric', () => {
    expect(levenshteinSimilarity('abc', 'axc')).toBe(levenshteinSimilarity('axc', 'abc'));
  });

  it('handles single character strings', () => {
    expect(levenshteinSimilarity('a', 'a')).toBe(1.0);
    expect(levenshteinSimilarity('a', 'b')).toBe(0.0);
  });
});

describe('tokenSetSimilarity', () => {
  it('returns 1.0 for identical token sets', () => {
    expect(tokenSetSimilarity('JOHN DOE', 'JOHN DOE')).toBe(1.0);
  });

  it('handles reordered tokens', () => {
    expect(tokenSetSimilarity('JOHN DOE', 'DOE JOHN')).toBe(1.0);
  });

  it('handles extra tokens gracefully', () => {
    // "JOHN MICHAEL DOE" vs "JOHN DOE" — shared tokens match, extra lowers score
    const score = tokenSetSimilarity('JOHN MICHAEL DOE', 'JOHN DOE');
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it('returns low score for completely different names', () => {
    // Sorted: "ALICE SMITH" vs "BOB JONES" — low Levenshtein but not exactly 0
    expect(tokenSetSimilarity('ALICE SMITH', 'BOB JONES')).toBeLessThan(0.2);
  });
});

describe('compareIdNumber', () => {
  it('returns 1.0 for exact match after normalization', () => {
    expect(compareIdNumber('AB1234567', 'AB1234567')).toBe(1.0);
  });

  it('returns 1.0 ignoring whitespace and case differences', () => {
    expect(compareIdNumber(' ab 1234567 ', 'AB1234567')).toBe(1.0);
  });

  it('returns 0.5 for high similarity (>85%) — OCR noise signal', () => {
    // AB1234567 vs AB1234568 — 1 char different out of 9 = ~89% similar
    expect(compareIdNumber('AB1234567', 'AB1234568')).toBe(0.5);
  });

  it('returns 0.0 for low similarity', () => {
    expect(compareIdNumber('AB1234567', 'XY9876543')).toBe(0.0);
  });

  it('returns 0.0 when either value is null/empty', () => {
    expect(compareIdNumber('', 'AB123')).toBe(0.0);
    expect(compareIdNumber('AB123', '')).toBe(0.0);
  });
});

describe('compareName', () => {
  it('returns 1.0 for exact match', () => {
    expect(compareName('JOHN DOE', 'JOHN DOE')).toBe(1.0);
  });

  it('handles name reordering via token set', () => {
    // "DOE JOHN" vs "JOHN DOE" should score high
    expect(compareName('DOE JOHN', 'JOHN DOE')).toBeGreaterThanOrEqual(0.85);
  });

  it('handles diacritics', () => {
    expect(compareName('García López', 'GARCIA LOPEZ')).toBe(1.0);
  });

  it('uses max of levenshtein and token-set similarity', () => {
    // Spec says: max(levenshtein_similarity, token_set_similarity)
    const score = compareName('JOHN M DOE', 'JOHN DOE');
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns 0.0 for completely different names', () => {
    expect(compareName('ALICE SMITH', 'BOB JONES')).toBeLessThan(0.3);
  });

  it('returns 0.0 when either value is null/empty', () => {
    expect(compareName('', 'JOHN')).toBe(0.0);
    expect(compareName('JOHN', '')).toBe(0.0);
  });
});

describe('compareDate', () => {
  it('returns 1.0 for exact date match', () => {
    expect(compareDate('1990-01-15', '1990-01-15')).toBe(1.0);
  });

  it('returns 1.0 for equivalent date formats', () => {
    expect(compareDate('15/01/1990', '1990-01-15')).toBe(1.0);
  });

  it('returns 1.0 for MRZ date vs standard date', () => {
    expect(compareDate('900115', '1990-01-15')).toBe(1.0);
  });

  it('returns 0.0 for different dates', () => {
    expect(compareDate('1990-01-15', '1990-01-16')).toBe(0.0);
  });

  it('returns 0.0 when either date is null/unparseable', () => {
    expect(compareDate('', '1990-01-15')).toBe(0.0);
    expect(compareDate('not-a-date', '1990-01-15')).toBe(0.0);
  });
});

describe('compareNationality', () => {
  it('returns 1.0 for exact match', () => {
    expect(compareNationality('USA', 'USA')).toBe(1.0);
  });

  it('returns 1.0 for alpha-2 vs alpha-3 match', () => {
    expect(compareNationality('US', 'USA')).toBe(1.0);
    expect(compareNationality('GB', 'GBR')).toBe(1.0);
  });

  it('returns 0.0 for different nationalities', () => {
    expect(compareNationality('USA', 'GBR')).toBe(0.0);
  });

  it('returns 0.0 when either is null/empty', () => {
    expect(compareNationality('', 'USA')).toBe(0.0);
  });
});
