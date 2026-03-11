/**
 * Cross-validator field configuration.
 * Weights and criticality per spec:
 *   id_number (40%, critical), full_name (25%, critical),
 *   date_of_birth (20%, critical), expiry_date (10%), nationality (5%)
 */

export interface FieldConfig {
  weight: number;
  critical: boolean;
  passThreshold: number;
}

export const FIELD_WEIGHTS: Record<string, FieldConfig> = {
  id_number: { weight: 0.40, critical: true, passThreshold: 1.0 },
  full_name: { weight: 0.25, critical: true, passThreshold: 0.85 },
  date_of_birth: { weight: 0.20, critical: true, passThreshold: 1.0 },
  expiry_date: { weight: 0.10, critical: false, passThreshold: 1.0 },
  nationality: { weight: 0.05, critical: false, passThreshold: 0.80 },
};

/** Score >= this → PASS (unlocks live capture) */
export const THRESHOLD_PASS = 0.92;

/** Score >= this (but < PASS) → REVIEW (still unlocks live capture, flags for review) */
export const THRESHOLD_REVIEW = 0.75;
