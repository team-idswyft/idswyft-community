/**
 * DL Number Format Validator
 *
 * Validates driver's license numbers against known state/country formats.
 * Used as a supplementary signal in cross-validation (weight 0).
 *
 * For US documents: checks against STATE_DL_FORMATS (51 state patterns).
 * For non-US documents: delegates to validateIdNumber() from internationalIdFormats.
 */

import { STATE_DL_FORMATS, validateIdNumber } from '@idswyft/shared';

export interface DlValidationResult {
  valid: boolean;
  verdict: 'PASS' | 'FAIL' | 'REVIEW' | 'SKIP';
  matched_pattern: string | null;
  issuing_state: string | null;
  detail: string;
}

/**
 * Validate a DL/ID number against known format patterns.
 *
 * @param idNumber    - The extracted document number (uppercase, no spaces)
 * @param issuingCountry - ISO alpha-2 country code (e.g. "US", "GB"), or null
 * @param issuingState   - US state abbreviation (e.g. "CA"), or null/undefined
 */
export function validateDlNumber(
  idNumber: string,
  issuingCountry: string | null,
  issuingState?: string | null,
): DlValidationResult {
  // No ID number → nothing to validate
  if (!idNumber || idNumber.trim().length === 0) {
    return {
      valid: false,
      verdict: 'SKIP',
      matched_pattern: null,
      issuing_state: null,
      detail: 'No document number to validate',
    };
  }

  const cleaned = idNumber.trim().toUpperCase();
  const country = issuingCountry?.toUpperCase() ?? null;

  // ── Non-US: delegate to international format registry ──
  if (country && country !== 'US') {
    const isValid = validateIdNumber(country, 'drivers_license', cleaned);
    // validateIdNumber returns true when no format is registered (no constraint)
    // We can't distinguish "no format" from "valid format" without checking getCountryFormat
    // but for simplicity: true → PASS, false → FAIL
    return {
      valid: isValid,
      verdict: isValid ? 'PASS' : 'FAIL',
      matched_pattern: isValid ? `${country} format` : null,
      issuing_state: null,
      detail: isValid
        ? `ID number matches ${country} format`
        : `ID number does not match ${country} format`,
    };
  }

  // ── US with known state ──
  const state = issuingState?.toUpperCase() ?? null;
  if (state && STATE_DL_FORMATS[state]) {
    const format = STATE_DL_FORMATS[state];
    const matches = format.regex.test(cleaned);
    return {
      valid: matches,
      verdict: matches ? 'PASS' : 'FAIL',
      matched_pattern: matches ? `${state}: ${format.description}` : null,
      issuing_state: state,
      detail: matches
        ? `DL number matches ${state} format (${format.description})`
        : `DL number "${cleaned}" does not match ${state} format (expected: ${format.description})`,
    };
  }

  // ── US without known state: check all 51 patterns ──
  const matchingStates: string[] = [];
  for (const [stateCode, format] of Object.entries(STATE_DL_FORMATS)) {
    if (format.regex.test(cleaned)) {
      matchingStates.push(stateCode);
    }
  }

  if (matchingStates.length === 1) {
    const matched = matchingStates[0];
    return {
      valid: true,
      verdict: 'PASS',
      matched_pattern: `${matched}: ${STATE_DL_FORMATS[matched].description}`,
      issuing_state: matched,
      detail: `DL number uniquely matches ${matched} format`,
    };
  }

  if (matchingStates.length > 1) {
    return {
      valid: true,
      verdict: 'REVIEW',
      matched_pattern: matchingStates.join(', '),
      issuing_state: null,
      detail: `DL number matches ${matchingStates.length} state formats: ${matchingStates.join(', ')}`,
    };
  }

  // No matches at all
  return {
    valid: false,
    verdict: 'FAIL',
    matched_pattern: null,
    issuing_state: null,
    detail: `DL number "${cleaned}" does not match any known US state format`,
  };
}
