/**
 * Document Auto-Classification
 *
 * Pure function that classifies a document type from raw OCR text.
 * Uses MRZ patterns, keyword matching, and field-pattern heuristics.
 * No external dependencies — deterministic and fully auditable.
 */

export interface ClassificationResult {
  type: 'passport' | 'drivers_license' | 'national_id';
  confidence: number;
  signals: string[];
}

// MRZ line pattern: uppercase letters, digits, and filler characters (<)
const MRZ_LINE = /^[A-Z0-9<]{30,44}$/;

// Keyword patterns
const PASSPORT_KW = /PASSPORT/;
const DL_KW = /DRIVER'?S?\s*(LIC|LICENSE|LICENCE)|DEPARTMENT\s+OF\s+MOTOR|\bDMV\b/;
const NID_KW = /NATIONAL\s*ID|IDENTITY\s*CARD|CARTE\s*D'IDENTIT/;

// AAMVA field codes commonly found in US driver's license OCR text
const AAMVA_CODES = ['DCS', 'DAC', 'DAD', 'DAQ', 'DBB', 'DBA', 'DAG', 'DAJ', 'DAK'];

// DL-specific field tokens
const DL_FIELD_TOKENS = [
  'HGT', 'WT', 'SEX', 'HAIR', 'EYES', 'CLASS',
  'ENDORSEMENTS', 'RESTRICTIONS', 'RSTR', 'REST',
];

/**
 * Classify document type from raw OCR text.
 *
 * Priority order:
 * 1. MRZ detection (highest confidence)
 * 2. Keyword matching
 * 3. Field-pattern matching (AAMVA codes, DL tokens)
 * 4. Default fallback to drivers_license
 */
export function classifyDocument(rawText: string): ClassificationResult {
  const signals: string[] = [];

  // ── 1. MRZ detection ──────────────────────────────────────────
  const lines = rawText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const mrzLines = lines.filter(l => MRZ_LINE.test(l));

  if (mrzLines.length >= 2) {
    const lengths = mrzLines.map(l => l.length);

    // TD3 passport: 2+ lines of 44 characters
    if (lengths.filter(l => l === 44).length >= 2) {
      signals.push('mrz_td3_44char');
      return { type: 'passport', confidence: 0.95, signals };
    }

    // TD1 national ID: 3 lines of 30 characters
    if (lengths.filter(l => l === 30).length >= 3) {
      signals.push('mrz_td1_30char');
      return { type: 'national_id', confidence: 0.95, signals };
    }

    // TD2 national ID: 2 lines of 36 characters
    if (lengths.filter(l => l === 36).length >= 2) {
      signals.push('mrz_td2_36char');
      return { type: 'national_id', confidence: 0.95, signals };
    }
  }

  // ── 2. Keyword matching ───────────────────────────────────────
  const upper = rawText.toUpperCase();

  if (PASSPORT_KW.test(upper)) {
    signals.push('keyword_passport');
    return { type: 'passport', confidence: 0.85, signals };
  }

  if (DL_KW.test(upper)) {
    signals.push('keyword_drivers_license');
    return { type: 'drivers_license', confidence: 0.85, signals };
  }

  if (NID_KW.test(upper)) {
    signals.push('keyword_national_id');
    return { type: 'national_id', confidence: 0.85, signals };
  }

  // ── 3. Field-pattern matching ─────────────────────────────────
  const upperWords = new Set(upper.split(/[\s,;:|]+/));

  const aamvaCount = AAMVA_CODES.filter(c => upperWords.has(c)).length;
  if (aamvaCount >= 2) {
    signals.push(`aamva_codes_${aamvaCount}`);
    return { type: 'drivers_license', confidence: 0.75, signals };
  }

  const dlTokenCount = DL_FIELD_TOKENS.filter(t => upperWords.has(t)).length;
  if (dlTokenCount >= 3) {
    signals.push(`dl_field_tokens_${dlTokenCount}`);
    return { type: 'drivers_license', confidence: 0.75, signals };
  }

  // ── 4. Default fallback ───────────────────────────────────────
  signals.push('default_fallback');
  return { type: 'drivers_license', confidence: 0.50, signals };
}
