/**
 * Gate 2 — Back Document Integrity
 *
 * FAIL if:
 *   - US document: No barcode found (qr_payload is null) AND no MRZ
 *   - Non-US document: Neither barcode NOR MRZ found
 *   - MRZ checksums failed (checksums_valid === false)
 *   - Front MRZ and back MRZ disagree (BACK_MRZ_BARCODE_MISMATCH)
 *
 * PASS if:
 *   - Barcode decoded and all MRZ checks pass, OR
 *   - Non-US document with valid MRZ (barcode not required)
 */

import type { BackExtractionResult, FrontExtractionResult, GateResult } from '@idswyft/shared';

export function evaluateGate2(
  back: BackExtractionResult,
  front: FrontExtractionResult,
  issuingCountry?: string | null,
): GateResult {
  const isUS = !issuingCountry || issuingCountry === 'US';
  const hasBarcode = !!(back.qr_payload || back.barcode_format);
  const hasMRZ = !!(back.mrz_result && back.mrz_result.raw_lines.length > 0);
  const isMRZFormat = back.barcode_format?.startsWith('MRZ_');

  // Check barcode/MRZ presence
  if (!hasBarcode && !hasMRZ && !isMRZFormat) {
    if (isUS) {
      // US documents require a barcode (PDF417)
      return {
        passed: false,
        rejection_reason: 'BACK_BARCODE_NOT_FOUND',
        rejection_detail: 'No barcode (PDF417, QR, DataMatrix) detected on back of document',
        user_message: 'We could not read the barcode on the back of your ID. Please retake the photo ensuring the barcode is clearly visible.',
      };
    } else {
      // Non-US: accept MRZ as alternative, but fail if neither found
      return {
        passed: false,
        rejection_reason: 'BACK_BARCODE_NOT_FOUND',
        rejection_detail: 'No barcode or MRZ detected on back of document',
        user_message: 'We could not read the barcode or machine-readable zone on the back of your ID. Please retake the photo ensuring the back is clearly visible.',
      };
    }
  }

  // Check MRZ checksums if present
  if (back.mrz_result && !back.mrz_result.checksums_valid) {
    return {
      passed: false,
      rejection_reason: 'BACK_MRZ_CHECKSUM_FAILED',
      rejection_detail: 'MRZ checksum validation failed — possible physical tampering',
      user_message: 'We detected an issue with your document. Please ensure you are using an original, unaltered ID.',
    };
  }

  // Check front MRZ vs back MRZ consistency
  if (front.mrz_from_front && front.mrz_from_front.length > 0 && back.mrz_result) {
    const frontMrzJoined = front.mrz_from_front.join('').replace(/[^A-Z0-9<]/g, '');
    const backMrzJoined = back.mrz_result.raw_lines.join('').replace(/[^A-Z0-9<]/g, '');

    if (frontMrzJoined !== backMrzJoined) {
      return {
        passed: false,
        rejection_reason: 'BACK_MRZ_BARCODE_MISMATCH',
        rejection_detail: `Front MRZ does not match back MRZ — strong fraud signal`,
        user_message: 'The front and back of your document do not appear to match. Please ensure both images are from the same ID.',
      };
    }
  }

  return {
    passed: true,
    rejection_reason: null,
    rejection_detail: null,
    user_message: null,
  };
}
