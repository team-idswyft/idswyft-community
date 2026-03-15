import { describe, it, expect } from 'vitest';
import { normalizeAddress, parseAddress, extractNameFromAddressDoc } from '../addressNormalizer.js';
import { validateAddressDocument } from '../addressValidator.js';
import type { AddressExtractionResult } from '../addressExtractor.js';

// ─── Address Normalizer Tests ────────────────────────────

describe('normalizeAddress', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeAddress('123 Main St., Apt #4')).toBe('123 main st apt 4');
  });

  it('converts full words to abbreviations', () => {
    expect(normalizeAddress('123 Main Street')).toBe('123 main st');
    expect(normalizeAddress('456 Oak Avenue')).toBe('456 oak ave');
    expect(normalizeAddress('789 Pine Boulevard')).toBe('789 pine blvd');
  });

  it('normalizes direction words', () => {
    expect(normalizeAddress('100 North Broadway')).toBe('100 n broadway');
    expect(normalizeAddress('200 Southeast 5th')).toBe('200 se 5th');
  });

  it('collapses whitespace', () => {
    expect(normalizeAddress('123   Main    Street')).toBe('123 main st');
  });

  it('handles empty input', () => {
    expect(normalizeAddress('')).toBe('');
    expect(normalizeAddress(null as any)).toBe('');
  });
});

describe('parseAddress', () => {
  it('extracts US ZIP code', () => {
    const result = parseAddress('123 Main St, Springfield, IL 62704');
    expect(result.postalCode).toBe('62704');
  });

  it('extracts ZIP+4', () => {
    const result = parseAddress('123 Main St, Springfield, IL 62704-1234');
    expect(result.postalCode).toBe('62704-1234');
  });

  it('extracts Canadian postal code', () => {
    const result = parseAddress('123 Main St, Toronto ON M5V 2T6');
    expect(result.postalCode).toBe('M5V2T6');
  });

  it('extracts apartment number', () => {
    const result = parseAddress('123 Main St, Apt 4B, Springfield');
    expect(result.unit).toBe('4B');
  });

  it('extracts street number', () => {
    const result = parseAddress('123 Main St, Springfield, IL');
    expect(result.streetNumber).toBe('123');
  });

  it('extracts US state abbreviation', () => {
    const result = parseAddress('Springfield, IL 62704');
    expect(result.state).toBe('IL');
  });

  it('handles empty input', () => {
    const result = parseAddress('');
    expect(result.raw).toBe('');
  });
});

describe('extractNameFromAddressDoc', () => {
  it('extracts name from typical utility bill text', () => {
    const text = [
      'ELECTRIC UTILITY CO',
      'Statement Date: 01/15/2024',
      'John Smith',
      '123 Main Street',
      'Springfield IL 62704',
      'Account Number: 12345678',
    ].join('\n');

    const name = extractNameFromAddressDoc(text);
    expect(name).toBe('John Smith');
  });

  it('skips lines with numbers', () => {
    const text = [
      'Account 12345678',
      'Jane Doe',
      '456 Oak Avenue',
    ].join('\n');

    const name = extractNameFromAddressDoc(text);
    expect(name).toBe('Jane Doe');
  });

  it('returns null for empty text', () => {
    expect(extractNameFromAddressDoc('')).toBeNull();
    expect(extractNameFromAddressDoc(null as any)).toBeNull();
  });
});

// ─── Address Validator Tests ─────────────────────────────

describe('validateAddressDocument', () => {
  const baseExtraction: AddressExtractionResult = {
    name: 'John Smith',
    address: '123 Main Street, Springfield, IL 62704',
    components: {
      raw: '123 Main Street, Springfield, IL 62704',
      streetNumber: '123',
      postalCode: '62704',
      state: 'IL',
    },
    document_date: new Date().toISOString(),
    confidence: 0.85,
    raw_text: 'Some raw text',
  };

  it('passes when name matches and address is present', () => {
    const result = validateAddressDocument(baseExtraction, 'John Smith');
    expect(result.verdict).toBe('pass');
    expect(result.passed).toBe(true);
    expect(result.name_match_score).toBeGreaterThanOrEqual(0.8);
    expect(result.overall_score).toBeGreaterThanOrEqual(0.75);
  });

  it('passes with fuzzy name match (reordered)', () => {
    const result = validateAddressDocument(baseExtraction, 'Smith John');
    expect(result.verdict).toBe('pass');
    expect(result.name_match_score).toBeGreaterThanOrEqual(0.8);
  });

  it('rejects when name does not match', () => {
    const result = validateAddressDocument(baseExtraction, 'Jane Williams');
    expect(result.verdict).not.toBe('pass');
    expect(result.name_match_score).toBeLessThan(0.8);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('routes to review when no name on address document', () => {
    const noName = { ...baseExtraction, name: null };
    const result = validateAddressDocument(noName, 'John Smith');
    expect(result.verdict).not.toBe('pass');
    expect(result.reasons).toContain('No name found on address document');
  });

  it('routes to review when no address found', () => {
    const noAddr = {
      ...baseExtraction,
      address: null,
      components: { raw: '' },
    };
    const result = validateAddressDocument(noAddr, 'John Smith');
    expect(result.reasons).toContain('No address found on document');
  });

  it('downgrades pass to review for stale documents', () => {
    const stale = {
      ...baseExtraction,
      document_date: '2020-01-01T00:00:00Z', // Very old
    };
    const result = validateAddressDocument(stale, 'John Smith');
    expect(result.document_fresh).toBe(false);
    expect(result.verdict).toBe('review');
  });

  it('handles missing document date gracefully', () => {
    const noDate = { ...baseExtraction, document_date: null };
    const result = validateAddressDocument(noDate, 'John Smith');
    expect(result.document_fresh).toBeNull();
    // Should still pass based on name + address
    expect(result.verdict).toBe('pass');
  });

  it('flags missing postal code', () => {
    const noZip = {
      ...baseExtraction,
      components: { raw: '123 Main St', streetNumber: '123' },
    };
    const result = validateAddressDocument(noZip, 'John Smith');
    expect(result.reasons).toContain('No postal/ZIP code detected in address');
  });
});
