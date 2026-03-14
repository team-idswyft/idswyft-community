/**
 * MRZ (Machine Readable Zone) Service
 *
 * Wraps the `mrz` library to parse all 3 ICAO MRZ formats:
 *   - TD1 (ID cards, 3 lines × 30 chars)
 *   - TD2 (ID cards, 2 lines × 36 chars)
 *   - TD3 (Passports, 2 lines × 44 chars)
 *
 * Also handles detection of MRZ patterns in raw OCR text.
 */

import { parse as parseMRZ } from 'mrz';
import type { ParseResult, MRZFormat } from 'mrz';
import { logger } from '@/utils/logger.js';

export interface MRZParseResult {
  format: MRZFormat;
  valid: boolean;
  check_digits_valid: boolean;
  fields: {
    document_number: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    date_of_birth: string | null;   // YYYY-MM-DD
    expiry_date: string | null;     // YYYY-MM-DD
    nationality: string | null;     // ISO alpha-3
    issuing_country: string | null; // ISO alpha-3 (issuingState from MRZ)
    sex: string | null;
  };
  raw_lines: string[];
}

// MRZ line length → expected format
const MRZ_LINE_LENGTHS = new Set([30, 36, 44]);

/**
 * Detect MRZ-like lines in raw OCR text.
 * MRZ lines consist of uppercase letters, digits, and `<` filler characters.
 * Returns the detected lines grouped by line length, or null if none found.
 */
export function detectMRZInText(rawText: string): string[] | null {
  if (!rawText) return null;

  const lines = rawText.split('\n').map(l => l.trim());
  const mrzCandidates: string[] = [];

  for (const line of lines) {
    // MRZ lines: uppercase letters, digits, and < filler only
    const cleaned = line.replace(/\s/g, '');
    if (cleaned.length >= 30 && /^[A-Z0-9<]+$/.test(cleaned) && MRZ_LINE_LENGTHS.has(cleaned.length)) {
      mrzCandidates.push(cleaned);
    }
  }

  if (mrzCandidates.length < 2) return null;

  // Group by line length to find consistent MRZ blocks
  const byLength = new Map<number, string[]>();
  for (const line of mrzCandidates) {
    const len = line.length;
    if (!byLength.has(len)) byLength.set(len, []);
    byLength.get(len)!.push(line);
  }

  // TD1 = 3 lines of 30, TD2 = 2 lines of 36, TD3 = 2 lines of 44
  for (const [len, group] of byLength) {
    if (len === 30 && group.length >= 3) return group.slice(0, 3);
    if ((len === 36 || len === 44) && group.length >= 2) return group.slice(0, 2);
  }

  return null;
}

/**
 * Parse MRZ lines using the `mrz` library.
 * Returns structured fields or null if parsing fails.
 */
export function parseMRZLines(lines: string[]): MRZParseResult | null {
  try {
    const result: ParseResult = parseMRZ(lines, { autocorrect: true });

    const fields = result.fields;

    return {
      format: result.format,
      valid: result.valid,
      check_digits_valid: result.valid,
      fields: {
        document_number: fields.documentNumber ?? null,
        first_name: fields.firstName ?? null,
        last_name: fields.lastName ?? null,
        full_name: [fields.firstName, fields.lastName].filter(Boolean).join(' ') || null,
        date_of_birth: normalizeMRZDate(fields.birthDate ?? null),
        expiry_date: normalizeMRZDate(fields.expirationDate ?? null),
        nationality: fields.nationality ?? null,
        issuing_country: fields.issuingState ?? null,
        sex: fields.sex ?? null,
      },
      raw_lines: lines,
    };
  } catch (error) {
    logger.warn('MRZ parsing failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      lineCount: lines.length,
      lineLengths: lines.map(l => l.length),
    });
    return null;
  }
}

/**
 * Convenience: detect + parse MRZ from raw OCR text in one call.
 */
export function extractMRZFromText(rawText: string): MRZParseResult | null {
  const lines = detectMRZInText(rawText);
  if (!lines) return null;
  return parseMRZLines(lines);
}

/**
 * Convert MRZ date format (YYMMDD) to ISO (YYYY-MM-DD).
 * The `mrz` library returns dates already formatted, but sometimes as YYMMDD.
 */
function normalizeMRZDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // YYMMDD format from MRZ
  if (/^\d{6}$/.test(dateStr)) {
    const yy = parseInt(dateStr.slice(0, 2));
    const mm = dateStr.slice(2, 4);
    const dd = dateStr.slice(4, 6);
    // MRZ convention: years 00-30 → 2000s, 31-99 → 1900s
    const century = yy <= 30 ? '20' : '19';
    return `${century}${dateStr.slice(0, 2)}-${mm}-${dd}`;
  }

  return dateStr;
}

// Re-export alpha3ToAlpha2 from normalizers for backward compatibility
export { alpha3ToAlpha2 } from '@/verification/cross-validator/normalizers.js';
