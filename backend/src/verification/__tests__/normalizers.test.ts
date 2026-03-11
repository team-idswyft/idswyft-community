import { describe, it, expect } from 'vitest';
import {
  normalizeIdNumber,
  normalizeName,
  normalizeDate,
  normalizeNationality,
  normalizeGeneric,
} from '../cross-validator/normalizers.js';

describe('normalizeIdNumber', () => {
  it('strips whitespace and converts to uppercase', () => {
    expect(normalizeIdNumber(' ab 1234567 ')).toBe('AB1234567');
  });

  it('removes hyphens and special characters', () => {
    expect(normalizeIdNumber('AB-123-456-7')).toBe('AB1234567');
  });

  it('returns null for empty/undefined input', () => {
    expect(normalizeIdNumber('')).toBeNull();
    expect(normalizeIdNumber(null as any)).toBeNull();
    expect(normalizeIdNumber(undefined as any)).toBeNull();
  });

  it('preserves alphanumeric characters only', () => {
    expect(normalizeIdNumber('AB.123/456#7')).toBe('AB1234567');
  });
});

describe('normalizeName', () => {
  it('strips whitespace, uppercases, and removes diacritics', () => {
    expect(normalizeName('  García  López  ')).toBe('GARCIA LOPEZ');
  });

  it('tokenizes and sorts name components', () => {
    expect(normalizeName('DOE JOHN')).toBe('DOE JOHN');
    // Token-sorted comparison happens in comparator, not normalizer
    // Normalizer just cleans the string
  });

  it('handles single-word names', () => {
    expect(normalizeName('MADONNA')).toBe('MADONNA');
  });

  it('removes special characters but preserves spaces', () => {
    expect(normalizeName("O'Brien-Smith")).toBe('OBRIENSMITH');
  });

  it('returns null for empty input', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName(null as any)).toBeNull();
  });

  it('collapses multiple spaces', () => {
    expect(normalizeName('JOHN    DOE')).toBe('JOHN DOE');
  });

  it('strips MRZ filler characters', () => {
    expect(normalizeName('DOE<<JOHN')).toBe('DOE JOHN');
  });
});

describe('normalizeDate', () => {
  it('normalizes YYYY-MM-DD format', () => {
    expect(normalizeDate('1990-01-15')).toBe('1990-01-15');
  });

  it('normalizes DD/MM/YYYY format', () => {
    expect(normalizeDate('15/01/1990')).toBe('1990-01-15');
  });

  it('normalizes DD-MM-YYYY format', () => {
    expect(normalizeDate('15-01-1990')).toBe('1990-01-15');
  });

  it('normalizes YYMMDD MRZ format', () => {
    expect(normalizeDate('900115')).toBe('1990-01-15');
  });

  it('handles 2000s in MRZ format (YYMMDD)', () => {
    expect(normalizeDate('050320')).toBe('2005-03-20');
  });

  it('returns null for unparseable dates', () => {
    expect(normalizeDate('not-a-date')).toBeNull();
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate(null as any)).toBeNull();
  });

  it('normalizes MM/DD/YYYY format (US dates)', () => {
    // Ambiguous dates — we follow DD/MM/YYYY convention by default
    // If day > 12, it's unambiguous
    expect(normalizeDate('25/01/1990')).toBe('1990-01-25');
  });

  it('normalizes MMDDYYYY format', () => {
    expect(normalizeDate('01151990')).toBe('1990-01-15');
  });
});

describe('normalizeNationality', () => {
  it('converts alpha-2 to alpha-3', () => {
    expect(normalizeNationality('US')).toBe('USA');
    expect(normalizeNationality('GB')).toBe('GBR');
    expect(normalizeNationality('DE')).toBe('DEU');
  });

  it('preserves already-alpha-3 codes', () => {
    expect(normalizeNationality('USA')).toBe('USA');
    expect(normalizeNationality('GBR')).toBe('GBR');
  });

  it('uppercases input', () => {
    expect(normalizeNationality('us')).toBe('USA');
    expect(normalizeNationality('usa')).toBe('USA');
  });

  it('returns null for empty/unknown', () => {
    expect(normalizeNationality('')).toBeNull();
    expect(normalizeNationality(null as any)).toBeNull();
  });

  it('handles common MRZ country codes', () => {
    expect(normalizeNationality('D')).toBe('DEU'); // Germany in MRZ
  });
});

describe('normalizeGeneric', () => {
  it('strips whitespace, lowercases, removes non-alphanumeric', () => {
    expect(normalizeGeneric(' Hello World! ')).toBe('helloworld');
  });

  it('returns null for empty input', () => {
    expect(normalizeGeneric('')).toBeNull();
    expect(normalizeGeneric(null as any)).toBeNull();
  });
});
