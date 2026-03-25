import type { OCRData } from '../../../types/index.js';

/** AAMVA field codes found in OCR'd text from PDF417 zones or raw text */
export const AAMVA_CODES: Record<string, keyof OCRData> = {
  DCS: 'name',
  DAC: 'name',
  DAD: 'name',
  DBB: 'date_of_birth',
  DBA: 'expiration_date',
  DAQ: 'document_number',
  DAG: 'address',
  DAJ: 'address',
  DAK: 'address',
  DBC: 'sex',
};

/** Regex matching AAMVA name field prefixes: "1MARTINEZ", "2 ELENA" */
export const AAMVA_NAME_RE = /^[12]\s*([A-Z][A-Z'\-,.\s]+?)(?:\s+\d{2,})?$/;

/** Alternate regex: handles "21 BRENDA" where AAMVA prefix "2" is stuck to another digit */
export const AAMVA_ALT_RE = /^([12])(\d)\s+([A-Z][A-Z'\-,.\s]+)$/;

/**
 * Label patterns used by buildLabelMap() to identify semantic fields.
 * Hoisted to module-level to avoid re-allocation on every call.
 */
export const LABEL_PATTERNS: Array<[string, RegExp]> = [
  ['dl_number',   /(?:4d\b|DLn?(?:\b|(?=\d))|DL\s*(?:NO\.?|#)|LIC(?:ENSE)?\s*(?:NO\.?|NUMBER|#)|OL\s*NO\.?|OPERATOR\s*(?:LICENSE|LIC)\s*(?:NO|#)?|PERMIT\s*NO|CUSTOMER\s*ID|CID\b|ID\s*NO\.?|ID(?=\s*\d)|(?:^|\s)I(?=\d{3}\s*\d{3}))/i],
  ['last_name',   /\b(?:LN|LAST\s*NAME|FAMILY\s*NAME|SURNAME)\b/i],
  ['first_name',  /\b(?:FN|FIRST\s*NAME|GIVEN\s*NAMES?)\b/i],
  ['full_name',   /\b(?:FULL\s*)?NAME\b/i],
  ['dob',         /(?:\bD[O0]B\b|D[O0]B(?=\d)|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|\bBORN\b|3\s+DATE)/i],
  ['expiry',      /\b(?:EXP(?:IRY|IRES)?|EXPIRATION|VALID\s*UNTIL|4b\b)\b/i],
  ['issued',      /\b(?:ISS(?:UED)?|ISSUE\s*DATE|4a\b)\b/i],
  ['address',     /\bADDR(?:ESS)?\b|^8\s+\d{1,5}\s+[A-Z]/i],
  ['sex',         /\bSEX\b/i],
  ['height',      /\b(?:HEIGHT|HGT|HT)\b/i],
  ['eyes',        /\bEYES?\b/i],
  ['hair',        /\bHAIR\b/i],
  ['class',       /\bCLASS\b/i],
];

/**
 * DL number patterns for Strategy B regex scan, ordered most-specific to least.
 * Hoisted to module-level to avoid re-allocation on every call.
 */
export const DL_NUMBER_PATTERNS: RegExp[] = [
  // Washington: WDL prefix (current post-2018 format)
  /\b(WDL[A-Z0-9]{9,12})\b/i,
  // New Hampshire current: NHL/NHN/NHV + 8 digits
  /\b(NH[LNV]\d{8})\b/,
  // Idaho: 2 letters + 6 digits + 1 letter (e.g., AB123456C)
  /\b([A-Z]{2}\d{6}[A-Z])\b/,
  // New Hampshire legacy: 2 digits + 3 letters + 5 digits (e.g., 12ABC45678)
  /\b(\d{2}[A-Z]{3}\d{5})\b/,
  // Iowa mixed: 3 digits + 2 letters + 4 digits (e.g., 123AB4567)
  /\b(\d{3}[A-Z]{2}\d{4})\b/,
  // Missouri mixed: 3 digits + 1 letter + 6 digits (e.g., 123A456789)
  /\b(\d{3}[A-Z]\d{6})\b/,
  // Kansas alternating: letter-digit-letter-digit-letter (e.g., K1A2B)
  /\b([A-Z]\d[A-Z]\d[A-Z])\b/,
  // Nevada X-prefix: X + 8 digits (non-citizen temporary)
  /\b(X\d{8})\b/,
  // Missouri R-suffix: letter + 6 digits + R (e.g., A123456R)
  /\b([A-Z]\d{6}R)\b/,
  // Letter(s) + digits: 1-3 letters + 6-14 digits (CA, FL, IL, MI, MN, MD, WI,
  //   MA, VA, ND 3L+6D, NJ 1L+14D, etc.)
  /\b([A-Z]{1,3}\d{6,14})\b/,
  // Digits + trailing letter(s): ME 7D+1L, VT 7D+A, MO 8D+2L / 9D+1L
  /\b(\d{7,9}[A-Z]{1,2})\b/,
  // Pure digits 7-14 (expanded for MT 13-14 digit, NV 12 digit, plus NC, NY, PA, TX, etc.)
  /\b(\d{7,14})\b/,
  // Spaced digit groups: "793 398 654" → "793398654" (NY and other states)
  /\b(\d{3}\s+\d{3}\s+\d{3})\b/,
  // Colorado: ##-###-####
  /\b(\d{2}-\d{3}-\d{4})\b/,
  // New York: ###-###-###
  /\b(\d{3}-\d{3}-\d{3})\b/,
  // "ID" or "I" (OCR misread) prefix + spaced digits: "I793 398 654" or "ID793 398 654"
  /\bI[D]?\s*(\d[\d\s]{5,16}\d)\b/i,
];
