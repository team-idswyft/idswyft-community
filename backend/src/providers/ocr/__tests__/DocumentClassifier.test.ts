import { describe, it, expect } from 'vitest';
import { classifyDocument } from '@idswyft/shared';

describe('classifyDocument', () => {
  // ── MRZ detection (highest priority) ────────────────────────

  it('detects passport from TD3 MRZ (44-char lines)', () => {
    const text = [
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
    ].join('\n');

    const result = classifyDocument(text);
    expect(result.type).toBe('passport');
    expect(result.confidence).toBe(0.95);
    expect(result.signals).toContain('mrz_td3_44char');
  });

  it('detects national_id from TD1 MRZ (30-char lines)', () => {
    // TD1: exactly 3 lines of 30 characters each
    const td1Text = [
      'IDUTO000000771234567890<<<01', // 28 — pad to 30
      '7408122F1204159UTO<<<<<<04<<', // 28 — pad to 30
      'ERIKSSON<<ANNA<MARIA<<<<<<<<', // 28 — pad to 30
    ].map(l => l.padEnd(30, '<').slice(0, 30)).join('\n');

    const result = classifyDocument(td1Text);
    expect(result.type).toBe('national_id');
    expect(result.confidence).toBe(0.95);
    expect(result.signals).toContain('mrz_td1_30char');
  });

  it('detects national_id from TD2 MRZ (36-char lines)', () => {
    // TD2: exactly 2 lines of 36 characters each
    const td2Text = [
      'IDUTO00000077<<<<<<<<<<<<<<<<<<',
      '7408122F1204159UTO<<<<<<<<<<<<<<',
    ].map(l => l.padEnd(36, '<').slice(0, 36)).join('\n');

    const result = classifyDocument(td2Text);
    expect(result.type).toBe('national_id');
    expect(result.confidence).toBe(0.95);
    expect(result.signals).toContain('mrz_td2_36char');
  });

  // ── Keyword detection ───────────────────────────────────────

  it('detects passport from keyword "PASSPORT"', () => {
    const text = 'UNITED STATES PASSPORT\nName: John Doe\nDOB: 1990-01-15';
    const result = classifyDocument(text);
    expect(result.type).toBe('passport');
    expect(result.confidence).toBe(0.85);
    expect(result.signals).toContain('keyword_passport');
  });

  it('detects drivers_license from keyword "DRIVER LICENSE"', () => {
    const text = 'STATE OF CALIFORNIA\nDRIVER LICENSE\nDL NO: D1234567';
    const result = classifyDocument(text);
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.85);
    expect(result.signals).toContain('keyword_drivers_license');
  });

  it('detects drivers_license from "DRIVERS LICENSE" (with S)', () => {
    const text = 'TEXAS DRIVERS LICENSE\nClass C';
    const result = classifyDocument(text);
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.85);
  });

  it('detects drivers_license from "DEPARTMENT OF MOTOR"', () => {
    const text = 'DEPARTMENT OF MOTOR VEHICLES\nCalifornia\nExpires: 2028';
    const result = classifyDocument(text);
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.85);
  });

  it('detects drivers_license from "DMV"', () => {
    const text = 'DMV\nState of New York\nClass D';
    const result = classifyDocument(text);
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.85);
  });

  it('detects national_id from keyword "NATIONAL ID"', () => {
    const text = 'REPUBLIC OF KENYA\nNATIONAL ID\nID NO: 12345678';
    const result = classifyDocument(text);
    expect(result.type).toBe('national_id');
    expect(result.confidence).toBe(0.85);
    expect(result.signals).toContain('keyword_national_id');
  });

  it('detects national_id from keyword "IDENTITY CARD"', () => {
    const text = 'IDENTITY CARD\nFEDERAL REPUBLIC OF GERMANY';
    const result = classifyDocument(text);
    expect(result.type).toBe('national_id');
    expect(result.confidence).toBe(0.85);
  });

  it('detects national_id from keyword "CARTE D\'IDENTIT"', () => {
    const text = "CARTE D'IDENTITE\nREPUBLIQUE FRANCAISE";
    const result = classifyDocument(text);
    expect(result.type).toBe('national_id');
    expect(result.confidence).toBe(0.85);
  });

  // ── Field-pattern detection ─────────────────────────────────

  it('detects drivers_license from AAMVA codes', () => {
    const text = 'DCS DOE\nDAC JOHN\nDAQ D1234567\nDBB 19900115';
    const result = classifyDocument(text);
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.75);
    expect(result.signals[0]).toMatch(/^aamva_codes_/);
  });

  it('detects drivers_license from DL field tokens', () => {
    const text = 'HGT 5-10\nWT 180\nSEX M\nHAIR BRN\nEYES BLU';
    const result = classifyDocument(text);
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.75);
    expect(result.signals[0]).toMatch(/^dl_field_tokens_/);
  });

  // ── Default fallback ────────────────────────────────────────

  it('falls back to drivers_license for empty text', () => {
    const result = classifyDocument('');
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.50);
    expect(result.signals).toContain('default_fallback');
  });

  it('falls back to drivers_license for garbage text', () => {
    const result = classifyDocument('xkcd lorem ipsum dolor sit amet 12345');
    expect(result.type).toBe('drivers_license');
    expect(result.confidence).toBe(0.50);
    expect(result.signals).toContain('default_fallback');
  });

  // ── Priority ordering ───────────────────────────────────────

  it('MRZ wins over keywords (passport MRZ + "IDENTITY CARD" text)', () => {
    const text = [
      'IDENTITY CARD',
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
    ].join('\n');

    const result = classifyDocument(text);
    expect(result.type).toBe('passport');
    expect(result.confidence).toBe(0.95);
    expect(result.signals).toContain('mrz_td3_44char');
  });

  it('keyword detection is case-insensitive', () => {
    const result = classifyDocument('passport\nJohn Doe');
    expect(result.type).toBe('passport');
    expect(result.confidence).toBe(0.85);
  });
});
