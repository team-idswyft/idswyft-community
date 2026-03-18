/**
 * Ground Truth Schema for OCR Benchmark
 *
 * Each specimen directory may contain a ground_truth_XX.json file
 * with the expected extraction results for that specimen.
 */

export interface GroundTruth {
  /** Full name as it appears on the document */
  full_name?: string;
  /** Date of birth in YYYY-MM-DD format */
  date_of_birth?: string;
  /** Document / license number */
  document_number?: string;
  /** Expiry date in YYYY-MM-DD format */
  expiry_date?: string;
  /** Nationality or citizenship */
  nationality?: string;
  /** Full address */
  address?: string;
  /** Sex / gender (M/F) */
  sex?: string;
  /** Issuing state (US only, 2-letter abbreviation) */
  issuing_state?: string;
  /** Issuing country (ISO alpha-2) */
  issuing_country?: string;
  /** Document type */
  document_type?: 'drivers_license' | 'passport' | 'national_id';
}

export interface FieldMetric {
  field: string;
  expected: string;
  extracted: string;
  exact_match: boolean;
  /** Normalized Levenshtein distance (0 = identical, 1 = completely different) */
  levenshtein_distance: number;
}

export interface SpecimenResult {
  specimen_id: string;
  country: string;
  front_processed: boolean;
  back_processed: boolean;
  cross_validated: boolean;
  field_metrics: FieldMetric[];
  processing_time_ms: number;
  errors: string[];
}

export interface BenchmarkSummary {
  total_specimens: number;
  front_extraction_rate: number;
  back_decode_rate: number;
  cross_validation_rate: number;
  field_accuracy: Record<string, { exact_match_rate: number; avg_levenshtein: number; count: number }>;
  avg_processing_time_ms: number;
  specimens: SpecimenResult[];
}
