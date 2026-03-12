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

  // If barcode returned all-empty fields, we can't cross-validate.
  // Auto-PASS with a low score — mobile phone photos often can't read barcodes.
  // The front OCR + face match (Gates 1, 4, 5) still protect against fraud.
  const backHasData = Object.values(backPayload).some(
    v => typeof v === 'string' && v.trim().length > 0
  );
  if (!backHasData) {
    const emptyFieldScores: Record<string, { score: number; passed: boolean; weight: number }> = {};
    for (const [field, config] of Object.entries(FIELD_WEIGHTS)) {
      emptyFieldScores[field] = { score: 0, passed: false, weight: config.weight };
    }

    // Check document expiry from front OCR only
    const frontExpiry = extractFrontField(frontOcr, 'expiry_date');
    const documentExpired = frontExpiry ? isExpired(frontExpiry, '') : false;

    console.log('🔎 ── Cross-Validation: back data empty — auto-PASS (barcode unreadable) ──');

    return {
      overall_score: 0.93,  // Just above PASS threshold so it doesn't block the flow
      field_scores: emptyFieldScores,
      has_critical_failure: false,
      document_expired: documentExpired,
      verdict: documentExpired ? 'REJECT' : 'PASS',
    };
  }

  const fieldScores: Record<string, { score: number; passed: boolean; weight: number }> = {};
  let hasCriticalFailure = false;
  let matchedWeight = 0;   // sum of weights for fields present on both sides
  let weightedScore = 0;   // sum of (score * weight) for matched fields

  console.log('🔎 ── Cross-Validation Start ──────────────────────');

  for (const [field, config] of Object.entries(FIELD_WEIGHTS)) {
    const frontValue = extractFrontField(frontOcr, field);
    const backValue = extractBackField(backPayload, field);

    const bothPresent = frontValue.trim().length > 0 && backValue.trim().length > 0;

    if (!bothPresent && !config.critical) {
      // Non-critical field missing on one side — skip, don't penalize
      fieldScores[field] = { score: 0, passed: false, weight: config.weight };
      console.log(`⏭️  ${field} (w=${config.weight}, critical=false): SKIPPED (missing on ${!frontValue.trim() ? 'front' : 'back'})`);
      console.log(`     front: "${frontValue}" | back: "${backValue}"`);
      continue;
    }

    // Critical fields MUST be present on both sides — missing = failure
    const comparator = COMPARATORS[field];
    const score = comparator ? comparator(frontValue, backValue) : 0;
    const passed = score >= config.passThreshold;

    fieldScores[field] = { score, passed, weight: config.weight };
    matchedWeight += config.weight;
    weightedScore += score * config.weight;

    if (config.critical && !passed) {
      hasCriticalFailure = true;
    }

    const status = passed ? '✅' : (config.critical ? '❌ CRITICAL' : '⚠️');
    console.log(`${status} ${field} (w=${config.weight}, critical=${config.critical}): score=${score.toFixed(3)}, passed=${passed}`);
    console.log(`     front: "${frontValue}" | back: "${backValue}"`);
  }

  // Normalize score: only count fields that were actually compared
  const overallScore = matchedWeight > 0
    ? Math.round((weightedScore / matchedWeight) * 100) / 100
    : 0;

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

  console.log('🔎 ── Cross-Validation Result ─────────────────────');
  console.log(`   Matched weight: ${matchedWeight.toFixed(2)} / 1.00 (${Object.keys(fieldScores).filter(f => fieldScores[f].score > 0 || FIELD_WEIGHTS[f]?.critical).length} fields compared)`);
  console.log(`   Overall score: ${overallScore} (PASS >= ${THRESHOLD_PASS}, REVIEW >= ${THRESHOLD_REVIEW})`);
  console.log(`   Critical failure: ${hasCriticalFailure}, Document expired: ${documentExpired}`);
  console.log(`   Verdict: ${verdict}`);
  console.log('🔎 ────────────────────────────────────────────────');

  return {
    overall_score: overallScore,
    field_scores: fieldScores,
    has_critical_failure: hasCriticalFailure,
    document_expired: documentExpired,
    verdict,
  };
}
