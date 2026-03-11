/**
 * Cross-Validator Engine
 *
 * Pure, synchronous, stateless. No I/O. No side effects.
 * Takes front + back extraction results and produces a CrossValidationResult
 * with per-field breakdown and overall weighted score.
 */

import type { FrontExtractionResult, BackExtractionResult, CrossValidationResult } from '../models/types.js';
import { FIELD_WEIGHTS, THRESHOLD_PASS, THRESHOLD_REVIEW } from './config.js';
import { compareIdNumber, compareName, compareDate, compareNationality } from './comparators.js';
import { normalizeDate } from './normalizers.js';

/** Map field names to their comparator functions */
const COMPARATORS: Record<string, (front: string, back: string) => number> = {
  id_number: compareIdNumber,
  full_name: compareName,
  date_of_birth: compareDate,
  expiry_date: compareDate,
  nationality: compareNationality,
};

/**
 * Extract a field value from OCR data, trying multiple possible key names.
 */
function extractFrontField(ocr: Record<string, unknown>, field: string): string {
  if (field === 'full_name') {
    // Try full_name, then construct from first + last
    const full = ocr.full_name || ocr.name;
    if (full) return String(full);
    const first = ocr.first_name || ocr.firstName || ocr.given_name;
    const last = ocr.last_name || ocr.lastName || ocr.family_name || ocr.surname;
    return [first, last].filter(Boolean).map(String).join(' ');
  }
  const value = ocr[field];
  return value != null ? String(value) : '';
}

/**
 * Extract a field value from barcode/QR payload, trying multiple possible key names.
 */
function extractBackField(payload: Record<string, unknown>, field: string): string {
  if (field === 'full_name') {
    // Try full_name, then construct from first + last
    const full = payload.full_name || payload.name;
    if (full) return String(full);
    const first = payload.first_name || payload.firstName;
    const last = payload.last_name || payload.lastName;
    return [first, last].filter(Boolean).map(String).join(' ');
  }
  const value = payload[field];
  return value != null ? String(value) : '';
}

/**
 * Check if a document expiry date is in the past.
 */
function isExpired(frontExpiry: string, backExpiry: string): boolean {
  // Try to parse from either source
  const normalized = normalizeDate(frontExpiry) || normalizeDate(backExpiry);
  if (!normalized) return false; // Can't determine, don't flag

  const expiry = new Date(normalized);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

/**
 * Cross-validate front and back extraction results.
 * Returns a CrossValidationResult with per-field scores, overall weighted score, and verdict.
 */
export function crossValidate(
  front: FrontExtractionResult,
  back: BackExtractionResult,
): CrossValidationResult {
  const frontOcr = front.ocr as Record<string, unknown>;
  const backPayload = (back.qr_payload || {}) as Record<string, unknown>;

  const fieldScores: Record<string, { score: number; passed: boolean; weight: number }> = {};
  let overallScore = 0;
  let hasCriticalFailure = false;

  for (const [field, config] of Object.entries(FIELD_WEIGHTS)) {
    const frontValue = extractFrontField(frontOcr, field);
    const backValue = extractBackField(backPayload, field);

    const comparator = COMPARATORS[field];
    const score = comparator ? comparator(frontValue, backValue) : 0;
    const passed = score >= config.passThreshold;

    fieldScores[field] = { score, passed, weight: config.weight };
    overallScore += score * config.weight;

    if (config.critical && !passed) {
      hasCriticalFailure = true;
    }
  }

  // Round to avoid floating point drift
  overallScore = Math.round(overallScore * 100) / 100;

  // Check document expiry
  const frontExpiry = extractFrontField(frontOcr, 'expiry_date');
  const backExpiry = extractBackField(backPayload, 'expiry_date');
  const documentExpired = isExpired(frontExpiry, backExpiry);

  // Determine verdict
  let verdict: 'PASS' | 'REVIEW' | 'REJECT';
  if (hasCriticalFailure || documentExpired || overallScore < THRESHOLD_REVIEW) {
    verdict = 'REJECT';
  } else if (overallScore >= THRESHOLD_PASS) {
    verdict = 'PASS';
  } else {
    verdict = 'REVIEW';
  }

  return {
    overall_score: overallScore,
    field_scores: fieldScores,
    has_critical_failure: hasCriticalFailure,
    document_expired: documentExpired,
    verdict,
  };
}
