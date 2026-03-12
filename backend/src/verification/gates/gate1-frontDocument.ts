/**
 * Gate 1 — Front Document Quality (lenient initial gate)
 *
 * FAIL only if:
 *   - ZERO OCR fields could be read (document is completely unreadable)
 *
 * SOFT CHECK (warn but pass):
 *   - Some OCR fields missing — cross-validation (Gate 3) handles thorough checks
 *   - OCR confidence below threshold — mobile phone photos often score lower
 *   - No face detected — face matching deferred to Gate 5 (selfie vs document)
 *
 * Gate 1 is intentionally lenient because mobile phone photos of ID cards
 * produce lower-quality OCR results (glare, angles, small text). The real
 * validation happens at Gate 3 (cross-validation) and Gate 5 (face match).
 */

import type { FrontExtractionResult, GateResult } from '../models/types.js';
import { VERIFICATION_THRESHOLDS } from '../../config/verificationThresholds.js';
import { logger } from '../../utils/logger.js';

/**
 * Fields we'd like to see on the front document. At least one must be present
 * for Gate 1 to pass. Full validation happens at Gate 3 (cross-validation).
 */
const DESIRED_FIELDS = ['full_name', 'date_of_birth', 'id_number', 'expiry_date'] as const;

/** Strings that are document headers, not real person names */
const HEADER_NOISE = [
  'driver license', 'drivers license', "driver's license",
  'passport', 'national id', 'identification card', 'id card',
];

function isNoiseValue(field: string, value: string): boolean {
  if (field === 'full_name') {
    return HEADER_NOISE.some(h => value.toLowerCase().trim() === h);
  }
  return false;
}

export function evaluateGate1(front: FrontExtractionResult): GateResult {
  // Log all OCR fields entering Gate 1 for diagnostics
  logger.info('Gate 1: evaluating front document', {
    ocr_fields: Object.fromEntries(
      DESIRED_FIELDS.map(f => [f, (front.ocr as Record<string, unknown>)[f] ?? '<undefined>'])
    ),
    ocr_confidence: front.ocr_confidence,
    face_confidence: front.face_confidence,
  });

  // Count how many desired fields have a real (non-noise) value
  const presentFields: string[] = [];
  const missingFields: string[] = [];
  for (const field of DESIRED_FIELDS) {
    const raw = (front.ocr as Record<string, unknown>)[field];
    const val = raw ? String(raw).trim() : '';
    if (val && !isNoiseValue(field, val)) {
      presentFields.push(field);
    } else {
      missingFields.push(field);
    }
  }

  // Hard reject only if ZERO useful fields were extracted — document is unreadable
  if (presentFields.length === 0) {
    logger.warn('Gate 1: REJECTING — no OCR fields could be read', {
      missingFields,
      all_ocr_keys: Object.keys(front.ocr),
    });
    return {
      passed: false,
      rejection_reason: 'FRONT_OCR_FAILED',
      rejection_detail: 'No required OCR fields could be read from the document',
      user_message: 'We could not read your ID. Please retake the photo with the full document visible in good lighting.',
    };
  }

  // Soft-warn about missing fields — cross-validation (Gate 3) will do the thorough check
  if (missingFields.length > 0) {
    logger.warn('Gate 1: some OCR fields missing (soft check — passing)', {
      presentFields,
      missingFields,
    });
  }

  // Soft check: OCR confidence — mobile phone photos often score below threshold
  if (front.ocr_confidence < VERIFICATION_THRESHOLDS.OCR_CONFIDENCE.minimum_acceptable) {
    logger.warn('Gate 1: low OCR confidence (soft check — passing)', {
      ocr_confidence: front.ocr_confidence,
      threshold: VERIFICATION_THRESHOLDS.OCR_CONFIDENCE.minimum_acceptable,
    });
  }

  // Soft check: face presence — warn but do not reject.
  // ID card photos are often too small for face-api to detect reliably.
  // The real face verification happens at Gate 5 (selfie vs document).
  if (front.face_confidence < VERIFICATION_THRESHOLDS.FACE_PRESENCE.minimum_confidence) {
    logger.warn('Gate 1: face not detected on front document (soft check — passing)', {
      face_confidence: front.face_confidence,
      threshold: VERIFICATION_THRESHOLDS.FACE_PRESENCE.minimum_confidence,
    });
  }

  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
