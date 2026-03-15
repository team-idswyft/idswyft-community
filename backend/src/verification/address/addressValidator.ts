/**
 * Address Validator
 *
 * Cross-references the name and address on a proof-of-address document
 * against the verified identity document. Produces a match score and verdict.
 */

import { compareName } from '../cross-validator/comparators.js';
import { normalizeAddress } from './addressNormalizer.js';
import type { AddressExtractionResult } from './addressExtractor.js';

// ─── Types ───────────────────────────────────────────────

export interface AddressValidationResult {
  /** Whether the address document passed validation */
  passed: boolean;
  /** Overall match score (0–1) */
  overall_score: number;
  /** Name match score between ID and address doc (0–1) */
  name_match_score: number;
  /** Address found on the document */
  address: string | null;
  /** Verdict: 'pass', 'review', or 'reject' */
  verdict: 'pass' | 'review' | 'reject';
  /** Reasons for the verdict */
  reasons: string[];
  /** Document date freshness check */
  document_fresh: boolean | null;
}

// ─── Thresholds ──────────────────────────────────────────

const NAME_MATCH_THRESHOLD = 0.80;  // Name must match at least 80%
const ADDRESS_PRESENT_WEIGHT = 0.30; // Weight for address being present/valid
const NAME_MATCH_WEIGHT = 0.50;      // Weight for name matching
const CONFIDENCE_WEIGHT = 0.20;      // Weight for OCR confidence
const PASS_THRESHOLD = 0.75;
const REVIEW_THRESHOLD = 0.50;

/** Maximum document age in days for freshness check (90 days) */
const MAX_DOCUMENT_AGE_DAYS = 90;

// ─── Validation ──────────────────────────────────────────

/**
 * Validate a proof-of-address document against identity data.
 *
 * @param extraction - Address extraction result from OCR
 * @param idName - Full name from the verified identity document
 */
export function validateAddressDocument(
  extraction: AddressExtractionResult,
  idName: string,
): AddressValidationResult {
  const reasons: string[] = [];

  // ── Name match ─────────────────────────────────────
  let nameMatchScore = 0;

  if (!extraction.name) {
    reasons.push('No name found on address document');
  } else if (!idName) {
    reasons.push('No name available from identity document for comparison');
  } else {
    nameMatchScore = compareName(extraction.name, idName);
    if (nameMatchScore < NAME_MATCH_THRESHOLD) {
      reasons.push(`Name mismatch: "${extraction.name}" vs ID name "${idName}" (score: ${nameMatchScore.toFixed(2)})`);
    }
  }

  // ── Address presence ───────────────────────────────
  let addressScore = 0;
  const normalizedAddress = normalizeAddress(extraction.address || '');

  if (!extraction.address) {
    reasons.push('No address found on document');
    addressScore = 0;
  } else if (normalizedAddress.length < 10) {
    reasons.push('Address too short to validate');
    addressScore = 0.3;
  } else {
    // Address is present and reasonably long
    addressScore = 1.0;

    // Bonus checks on address components
    if (extraction.components.postalCode) {
      addressScore = 1.0; // Has postal code — higher confidence
    } else {
      addressScore = 0.7; // No postal code — lower confidence
      reasons.push('No postal/ZIP code detected in address');
    }
  }

  // ── Document freshness ─────────────────────────────
  let documentFresh: boolean | null = null;

  if (extraction.document_date) {
    const docDate = new Date(extraction.document_date);
    if (!isNaN(docDate.getTime())) {
      const daysSince = (Date.now() - docDate.getTime()) / (1000 * 60 * 60 * 24);
      documentFresh = daysSince <= MAX_DOCUMENT_AGE_DAYS;
      if (!documentFresh) {
        reasons.push(`Document is ${Math.round(daysSince)} days old (max ${MAX_DOCUMENT_AGE_DAYS})`);
      }
    }
  }

  // ── Overall score ──────────────────────────────────
  const overallScore =
    (nameMatchScore * NAME_MATCH_WEIGHT) +
    (addressScore * ADDRESS_PRESENT_WEIGHT) +
    (extraction.confidence * CONFIDENCE_WEIGHT);

  // ── Verdict ────────────────────────────────────────
  let verdict: 'pass' | 'review' | 'reject';

  if (overallScore >= PASS_THRESHOLD && nameMatchScore >= NAME_MATCH_THRESHOLD) {
    verdict = 'pass';
  } else if (overallScore >= REVIEW_THRESHOLD) {
    verdict = 'review';
  } else {
    verdict = 'reject';
    if (reasons.length === 0) {
      reasons.push('Overall score below threshold');
    }
  }

  // Stale document downgrades pass to review
  if (verdict === 'pass' && documentFresh === false) {
    verdict = 'review';
    reasons.push('Document freshness check failed — routed to manual review');
  }

  return {
    passed: verdict === 'pass',
    overall_score: Math.round(overallScore * 100) / 100,
    name_match_score: Math.round(nameMatchScore * 100) / 100,
    address: extraction.address,
    verdict,
    reasons,
    document_fresh: documentFresh,
  };
}
