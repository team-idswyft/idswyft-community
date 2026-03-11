/**
 * Gate 1 — Front Document Quality
 *
 * FAIL if:
 *   - Any required OCR field missing (id_number, full_name, date_of_birth, expiry_date)
 *   - OCR confidence < 0.60
 *   - No face detected on front image (face_confidence < 0.45)
 *
 * PASS if all checks succeed.
 */

import type { FrontExtractionResult, GateResult } from '../models/types.js';
import { VERIFICATION_THRESHOLDS } from '../../config/verificationThresholds.js';

const REQUIRED_FIELDS = ['full_name', 'date_of_birth', 'id_number', 'expiry_date'] as const;

export function evaluateGate1(front: FrontExtractionResult): GateResult {
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = (front.ocr as Record<string, unknown>)[field];
    if (!value || String(value).trim() === '') {
      return {
        passed: false,
        rejection_reason: 'FRONT_OCR_FAILED',
        rejection_detail: `Required field '${field}' is missing or empty`,
        user_message: 'We could not read all required fields from your ID. Please retake the front of your document.',
      };
    }
  }

  // Check OCR confidence
  if (front.ocr_confidence < VERIFICATION_THRESHOLDS.OCR_CONFIDENCE.minimum_acceptable) {
    return {
      passed: false,
      rejection_reason: 'FRONT_LOW_CONFIDENCE',
      rejection_detail: `OCR confidence ${front.ocr_confidence.toFixed(2)} below threshold ${VERIFICATION_THRESHOLDS.OCR_CONFIDENCE.minimum_acceptable}`,
      user_message: 'The image quality is too low to read your ID clearly. Please retake the photo in better lighting.',
    };
  }

  // Check face presence
  if (front.face_confidence < VERIFICATION_THRESHOLDS.FACE_PRESENCE.minimum_confidence) {
    return {
      passed: false,
      rejection_reason: 'FRONT_OCR_FAILED',
      rejection_detail: `Face confidence ${front.face_confidence.toFixed(2)} below threshold ${VERIFICATION_THRESHOLDS.FACE_PRESENCE.minimum_confidence}`,
      user_message: 'We could not detect a photo on your ID. Please ensure the full front of the document is visible.',
    };
  }

  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
