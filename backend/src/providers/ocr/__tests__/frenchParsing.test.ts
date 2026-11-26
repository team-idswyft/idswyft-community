import { describe, it, expect } from 'vitest';
import { findSpacedDmyDates, normalizeCommaSeparatedNames } from '@idswyft/shared';

// These helpers back the French ID reading adopted from the Preuvid fork (MIT).
// They run in the engine's PaddleOCRProvider but live in @idswyft/shared so the
// backend vitest suite (the only suite CI runs) can exercise them.

describe('findSpacedDmyDates', () => {
  it('reads plausible space-separated DD MM YYYY dates', () => {
    // The 2021 CNI recto prints the date of birth and expiry with spaces.
    expect(findSpacedDmyDates('M FRA 08 01 1952')).toEqual(['1952-01-08']);
    expect(findSpacedDmyDates('16  06 2033 Signature')).toEqual(['2033-06-16']);
  });

  it('rejects implausible day, month, or year', () => {
    expect(findSpacedDmyDates('32 01 1952')).toEqual([]); // day out of range
    expect(findSpacedDmyDates('01 13 2000')).toEqual([]); // month out of range
    expect(findSpacedDmyDates('08 13 1952')).toEqual([]); // month out of range
    expect(findSpacedDmyDates('08 01 1852')).toEqual([]); // year before 1900
  });

  it('does not slice a longer run of digits', () => {
    expect(findSpacedDmyDates('1 08 01 19520')).toEqual([]); // trailing digit
    expect(findSpacedDmyDates('108 01 1952')).toEqual([]);   // leading digit touches
    expect(findSpacedDmyDates('12.08 01 1952')).toEqual([]); // dot touches
    expect(findSpacedDmyDates('06 12 34 56 78')).toEqual([]); // no 4-digit year group
  });

  it('matches a group that is preceded by digits plus a separating space', () => {
    expect(findSpacedDmyDates('123 08 01 1952')).toEqual(['1952-01-08']);
  });

  // Regression proof that non-French documents are unaffected. Every non-French
  // date uses a `/`, `-`, or `.` separator, which this helper never matches, so
  // it returns nothing and adds no candidate to those documents.
  it('ignores separator-delimited dates (non-French documents)', () => {
    expect(findSpacedDmyDates('DOB 12/05/1987')).toEqual([]);
    expect(findSpacedDmyDates('06-02-2028')).toEqual([]);
    expect(findSpacedDmyDates('1981.01.01')).toEqual([]);
  });
});

describe('normalizeCommaSeparatedNames', () => {
  it('collapses comma-separated given names to spaces', () => {
    expect(normalizeCommaSeparatedNames('JEAN, PIERRE')).toBe('JEAN PIERRE');
    expect(normalizeCommaSeparatedNames('CLAIRE, ANNE')).toBe('CLAIRE ANNE');
  });

  it('leaves a name without commas unchanged (any country)', () => {
    expect(normalizeCommaSeparatedNames('JEAN PIERRE')).toBe('JEAN PIERRE');
    expect(normalizeCommaSeparatedNames('SMITH')).toBe('SMITH');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCommaSeparatedNames('  JEAN ,PIERRE  ')).toBe('JEAN PIERRE');
  });
});
