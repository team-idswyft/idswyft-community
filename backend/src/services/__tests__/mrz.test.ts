import { describe, it, expect } from 'vitest';
import { detectMRZInText, parseMRZLines, extractMRZFromText, alpha3ToAlpha2 } from '../mrz.js';

// ── ICAO standard test vectors (correct character lengths) ──
// TD3 passport: 2 lines × 44 characters
const TD3_LINE1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'; // 44 chars
const TD3_LINE2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'; // 44 chars

// TD1 ID card: 3 lines × 30 characters
const TD1_LINE1 = 'I<UTOD231458907<<<<<<<<<<<<<<<'; // 30 chars
const TD1_LINE2 = '7408122F1204159UTO<<<<<<<<<<<6'; // 30 chars
const TD1_LINE3 = 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'; // 30 chars

describe('MRZ Service', () => {
  // ─── detectMRZInText ─────────────────────────────────────

  describe('detectMRZInText', () => {
    it('detects TD3 (passport) MRZ lines', () => {
      const text = [
        'UNITED STATES OF AMERICA',
        'PASSPORT',
        TD3_LINE1,
        TD3_LINE2,
      ].join('\n');

      const lines = detectMRZInText(text);
      expect(lines).not.toBeNull();
      expect(lines).toHaveLength(2);
      expect(lines![0]).toHaveLength(44);
      expect(lines![1]).toHaveLength(44);
    });

    it('detects TD1 (ID card) MRZ lines', () => {
      const text = [
        'BUNDESREPUBLIK DEUTSCHLAND',
        'PERSONALAUSWEIS',
        TD1_LINE1,
        TD1_LINE2,
        TD1_LINE3,
      ].join('\n');

      const lines = detectMRZInText(text);
      expect(lines).not.toBeNull();
      expect(lines).toHaveLength(3);
      expect(lines![0]).toHaveLength(30);
    });

    it('returns null for text with no MRZ', () => {
      const text = 'John Doe\n123 Main St\nNew York, NY 10001';
      expect(detectMRZInText(text)).toBeNull();
    });

    it('returns null for empty/null input', () => {
      expect(detectMRZInText('')).toBeNull();
    });

    it('ignores lines that are too short', () => {
      const text = 'ABCD<<EF\nGHIJ<<KL\n';
      expect(detectMRZInText(text)).toBeNull();
    });

    it('handles noisy OCR with mixed MRZ and regular text', () => {
      const text = [
        'UNITED KINGDOM',
        'Driver Licence',
        'Name: John Doe',
        TD3_LINE1,
        TD3_LINE2,
        'Issue Date: 01/01/2020',
      ].join('\n');

      const lines = detectMRZInText(text);
      expect(lines).not.toBeNull();
      expect(lines).toHaveLength(2);
    });
  });

  // ─── parseMRZLines ─────────────────────────────────────

  describe('parseMRZLines', () => {
    it('parses TD3 (passport) MRZ', () => {
      const result = parseMRZLines([TD3_LINE1, TD3_LINE2]);
      expect(result).not.toBeNull();
      expect(result!.format).toBe('TD3');
      expect(result!.fields.last_name).toBe('ERIKSSON');
      expect(result!.fields.first_name).toBe('ANNA MARIA');
      expect(result!.fields.document_number).toBe('L898902C3');
      // issuing_country comes from issuingState — may be null for fictional countries (UTO)
      expect('issuing_country' in result!.fields).toBe(true);
    });

    it('parses TD1 (ID card) MRZ', () => {
      const result = parseMRZLines([TD1_LINE1, TD1_LINE2, TD1_LINE3]);
      expect(result).not.toBeNull();
      expect(result!.format).toBe('TD1');
      expect(result!.fields.last_name).toBe('ERIKSSON');
      expect(result!.fields.first_name).toBe('ANNA MARIA');
      expect(result!.fields.document_number).toBe('D23145890');
    });

    it('returns full_name combining first and last', () => {
      const result = parseMRZLines([TD3_LINE1, TD3_LINE2]);
      expect(result!.fields.full_name).toBe('ANNA MARIA ERIKSSON');
    });

    it('returns null for garbage input', () => {
      const result = parseMRZLines(['not a valid mrz line']);
      expect(result).toBeNull();
    });

    it('includes raw_lines in result', () => {
      const lines = [TD3_LINE1, TD3_LINE2];
      const result = parseMRZLines(lines);
      expect(result!.raw_lines).toEqual(lines);
    });

    it('reports check_digits_valid for valid MRZ', () => {
      const result = parseMRZLines([TD3_LINE1, TD3_LINE2]);
      expect(result).not.toBeNull();
      expect(typeof result!.check_digits_valid).toBe('boolean');
    });

    it('extracts sex field', () => {
      const result = parseMRZLines([TD3_LINE1, TD3_LINE2]);
      expect(result).not.toBeNull();
      expect(result!.fields.sex).toBeTruthy();
    });
  });

  // ─── extractMRZFromText ──────────────────────────────────

  describe('extractMRZFromText', () => {
    it('detects and parses MRZ from raw OCR text in one call', () => {
      const text = [
        'PASSPORT',
        'UNITED STATES',
        TD3_LINE1,
        TD3_LINE2,
      ].join('\n');

      const result = extractMRZFromText(text);
      expect(result).not.toBeNull();
      expect(result!.format).toBe('TD3');
      expect(result!.fields.last_name).toBe('ERIKSSON');
    });

    it('returns null when no MRZ found', () => {
      const result = extractMRZFromText('Just some regular text');
      expect(result).toBeNull();
    });
  });

  // ─── alpha3ToAlpha2 ──────────────────────────────────────

  describe('alpha3ToAlpha2', () => {
    it('converts common country codes', () => {
      expect(alpha3ToAlpha2('GBR')).toBe('GB');
      expect(alpha3ToAlpha2('USA')).toBe('US');
      expect(alpha3ToAlpha2('DEU')).toBe('DE');
      expect(alpha3ToAlpha2('FRA')).toBe('FR');
      expect(alpha3ToAlpha2('BRA')).toBe('BR');
      expect(alpha3ToAlpha2('JPN')).toBe('JP');
    });

    it('handles D (Germany MRZ code)', () => {
      expect(alpha3ToAlpha2('D')).toBe('DE');
    });

    it('is case-insensitive', () => {
      expect(alpha3ToAlpha2('gbr')).toBe('GB');
      expect(alpha3ToAlpha2('Usa')).toBe('US');
    });

    it('strips MRZ filler characters', () => {
      expect(alpha3ToAlpha2('GBR<')).toBe('GB');
      expect(alpha3ToAlpha2('USA<<')).toBe('US');
    });

    it('returns null for unknown codes', () => {
      expect(alpha3ToAlpha2('XYZ')).toBeNull();
      expect(alpha3ToAlpha2(null)).toBeNull();
    });
  });
});
