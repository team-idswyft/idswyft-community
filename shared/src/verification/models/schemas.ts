import { z } from 'zod';

// --- Confidence score: always 0.0-1.0 ---
const confidence = z.number().min(0).max(1);

// --- Rejection Reasons (10 per spec) ---
export const RejectionReason = {
  FRONT_OCR_FAILED: 'FRONT_OCR_FAILED',
  FRONT_LOW_CONFIDENCE: 'FRONT_LOW_CONFIDENCE',
  BACK_BARCODE_NOT_FOUND: 'BACK_BARCODE_NOT_FOUND',
  BACK_MRZ_CHECKSUM_FAILED: 'BACK_MRZ_CHECKSUM_FAILED',
  BACK_MRZ_BARCODE_MISMATCH: 'BACK_MRZ_BARCODE_MISMATCH',
  CROSS_VALIDATION_FAILED: 'CROSS_VALIDATION_FAILED',
  DOCUMENT_EXPIRED: 'DOCUMENT_EXPIRED',
  LIVENESS_FAILED: 'LIVENESS_FAILED',
  FACE_NOT_DETECTED: 'FACE_NOT_DETECTED',
  FACE_MATCH_FAILED: 'FACE_MATCH_FAILED',
  AML_MATCH_FOUND: 'AML_MATCH_FOUND',
  AML_POTENTIAL_MATCH: 'AML_POTENTIAL_MATCH',
  DOCUMENT_TAMPERED: 'DOCUMENT_TAMPERED',
  DEEPFAKE_DETECTED: 'DEEPFAKE_DETECTED',
} as const;

export type RejectionReasonType = typeof RejectionReason[keyof typeof RejectionReason];

const RejectionReasonEnum = z.enum([
  'FRONT_OCR_FAILED',
  'FRONT_LOW_CONFIDENCE',
  'BACK_BARCODE_NOT_FOUND',
  'BACK_MRZ_CHECKSUM_FAILED',
  'BACK_MRZ_BARCODE_MISMATCH',
  'CROSS_VALIDATION_FAILED',
  'DOCUMENT_EXPIRED',
  'LIVENESS_FAILED',
  'FACE_NOT_DETECTED',
  'FACE_MATCH_FAILED',
  'AML_MATCH_FOUND',
  'AML_POTENTIAL_MATCH',
  'DOCUMENT_TAMPERED',
  'DEEPFAKE_DETECTED',
]);

// --- Verification Status (10 states per spec) ---
export const VerificationStatus = {
  AWAITING_FRONT: 'AWAITING_FRONT',
  FRONT_PROCESSING: 'FRONT_PROCESSING',
  AWAITING_BACK: 'AWAITING_BACK',
  BACK_PROCESSING: 'BACK_PROCESSING',
  CROSS_VALIDATING: 'CROSS_VALIDATING',
  AWAITING_LIVE: 'AWAITING_LIVE',
  LIVE_PROCESSING: 'LIVE_PROCESSING',
  FACE_MATCHING: 'FACE_MATCHING',
  COMPLETE: 'COMPLETE',
  HARD_REJECTED: 'HARD_REJECTED',
} as const;

export type VerificationStatusType = typeof VerificationStatus[keyof typeof VerificationStatus];

// --- OCR Data from front document ---
const IDCardOCRSchema = z.object({
  full_name: z.string().min(1),
  date_of_birth: z.string().min(1),
  id_number: z.string().min(1),
  expiry_date: z.string().min(1),
  nationality: z.string().optional(),
  issuing_country: z.string().length(2).optional(), // ISO 3166-1 alpha-2
}).passthrough(); // Allow additional OCR fields

// --- Document Authenticity (from tamper detection + zone validation) ---
const DocumentAuthenticitySchema = z.object({
  score: z.number().min(0).max(1),
  flags: z.array(z.string()),
  isAuthentic: z.boolean(),
  ganScore: z.number().min(0).max(1).optional(),
  zoneScore: z.number().min(0).max(1).optional(),
}).optional();

// --- Front Extraction Result ---
export const FrontExtractionResultSchema = z.object({
  ocr: IDCardOCRSchema,
  face_embedding: z.array(z.number()).nullable(),
  face_confidence: confidence,
  ocr_confidence: confidence,
  mrz_from_front: z.array(z.string()).nullable(),
  authenticity: DocumentAuthenticitySchema,
  face_age: z.number().optional(),
  face_gender: z.string().optional(),
});

export type FrontExtractionResult = z.infer<typeof FrontExtractionResultSchema>;

// --- QR/Barcode payload from back document ---
const QRPayloadSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  id_number: z.string().optional(),
  expiry_date: z.string().optional(),
  nationality: z.string().optional(),
}).passthrough(); // Allow additional barcode fields

// --- MRZ Parse Result ---
const MRZResultSchema = z.object({
  raw_lines: z.array(z.string()),
  fields: z.record(z.string()).optional(),
  checksums_valid: z.boolean(),
}).passthrough();

// --- Back Extraction Result ---
export const BackExtractionResultSchema = z.object({
  qr_payload: QRPayloadSchema.nullable(),
  mrz_result: MRZResultSchema.nullable(),
  barcode_format: z.enum(['PDF417', 'QR_CODE', 'DATA_MATRIX', 'CODE_128', 'MRZ_TD1', 'MRZ_TD2', 'MRZ_TD3']).nullable(),
  raw_barcode_data: z.string().nullable(),
});

export type BackExtractionResult = z.infer<typeof BackExtractionResultSchema>;

// --- Per-field score in cross-validation ---
const FieldScoreSchema = z.object({
  score: confidence,
  passed: z.boolean(),
  weight: confidence,
});

// --- DL Format Validation (supplementary, weight 0) ---
const DlFormatValidationSchema = z.object({
  valid: z.boolean(),
  verdict: z.enum(['PASS', 'FAIL', 'REVIEW', 'SKIP']),
  matched_pattern: z.string().nullable(),
  issuing_state: z.string().nullable(),
  detail: z.string(),
});

// --- Address Validation (supplementary, weight 0) ---
const AddressValidationSchema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(['PASS', 'REVIEW', 'FAIL']),
  front_address: z.string(),
  back_address: z.string(),
});

// --- Cross-Validation Result ---
export const CrossValidationResultSchema = z.object({
  overall_score: confidence,
  field_scores: z.record(FieldScoreSchema),
  has_critical_failure: z.boolean(),
  document_expired: z.boolean(),
  verdict: z.enum(['PASS', 'REVIEW', 'REJECT']),
  dl_format_validation: DlFormatValidationSchema.optional(),
  address_validation: AddressValidationSchema.optional(),
});

export type CrossValidationResult = z.infer<typeof CrossValidationResultSchema>;

// --- Live Capture Result ---
export const LiveCaptureResultSchema = z.object({
  face_embedding: z.array(z.number()).nullable(),
  face_confidence: confidence,
  liveness_passed: z.boolean(),
  liveness_score: confidence,
  deepfake_check: z.object({
    isReal: z.boolean(),
    realProbability: z.number().min(0).max(1),
    fakeProbability: z.number().min(0).max(1),
  }).optional(),
  face_age: z.number().optional(),
  face_gender: z.string().optional(),
});

export type LiveCaptureResult = z.infer<typeof LiveCaptureResultSchema>;

// --- Face Match Result ---
export const FaceMatchResultSchema = z.object({
  similarity_score: confidence,
  passed: z.boolean(),
  threshold_used: confidence,
  /** Set when face match could not be performed (missing embedding). */
  skipped_reason: z.string().optional(),
});

export type FaceMatchResult = z.infer<typeof FaceMatchResultSchema>;

// --- Gate Result (shared across all 5 gates) ---
export const GateResultSchema = z.object({
  passed: z.boolean(),
  rejection_reason: RejectionReasonEnum.nullable(),
  rejection_detail: z.string().nullable(),
  user_message: z.string().nullable(),
});

export type GateResult = z.infer<typeof GateResultSchema>;

// --- AML Screening Result (stored in session state) ---
export interface AMLScreeningSessionResult {
  risk_level: 'clear' | 'potential_match' | 'confirmed_match';
  match_found: boolean;
  match_count: number;
  matches: Array<{
    listed_name: string;
    list_source: string;
    score: number;
    match_type: string;
  }>;
  lists_checked: string[];
  screened_name: string;
  screened_dob: string | null;
  screened_at: string;
}

// --- Verification Mode / Flow Config ---

export type VerificationMode = 'full' | 'document_only' | 'identity' | 'liveness_only' | 'age_only';

export interface FlowConfig {
  preset: VerificationMode;
  requiresBack: boolean;
  requiresLiveness: boolean;
  requiresFaceMatch: boolean;
  totalSteps: number;
  /** Step to transition to after Gate 1 passes */
  afterFront: VerificationStatusType;
  /** Step to transition to after Gate 3 passes (crossval) — only if requiresBack */
  afterCrossVal: VerificationStatusType;
}

export const FLOW_PRESETS: Record<VerificationMode, FlowConfig> = {
  full:          { preset: 'full',          requiresBack: true,  requiresLiveness: true,  requiresFaceMatch: true,  totalSteps: 5, afterFront: 'AWAITING_BACK',  afterCrossVal: 'AWAITING_LIVE' },
  document_only: { preset: 'document_only', requiresBack: true,  requiresLiveness: false, requiresFaceMatch: false, totalSteps: 3, afterFront: 'AWAITING_BACK',  afterCrossVal: 'COMPLETE' },
  identity:      { preset: 'identity',      requiresBack: false, requiresLiveness: true,  requiresFaceMatch: true,  totalSteps: 3, afterFront: 'AWAITING_LIVE',  afterCrossVal: 'AWAITING_LIVE' },
  liveness_only: { preset: 'liveness_only', requiresBack: false, requiresLiveness: true,  requiresFaceMatch: true,  totalSteps: 1, afterFront: 'AWAITING_LIVE',  afterCrossVal: 'AWAITING_LIVE' },
  age_only:      { preset: 'age_only',      requiresBack: false, requiresLiveness: false, requiresFaceMatch: false, totalSteps: 1, afterFront: 'COMPLETE',       afterCrossVal: 'COMPLETE' },
};

/**
 * Passports are single-sided — skip back document + cross-validation.
 * Returns a new FlowConfig with requiresBack=false and afterFront pointing
 * to the next step after cross-validation (AWAITING_LIVE or COMPLETE).
 */
export function applyPassportOverride(flow: FlowConfig, detectedDocType?: string): FlowConfig {
  if (detectedDocType === 'passport' && flow.requiresBack) {
    // totalSteps is intentionally left unchanged — the STEP_MAPS index by
    // flow.preset so the progress numbers (1 → 4 → 5 out of 5) remain valid
    // even when steps 2-3 are skipped. Frontends maintain their own step lists.
    return { ...flow, requiresBack: false, afterFront: flow.afterCrossVal };
  }
  return flow;
}

// --- Age Estimation Result ---
export interface AgeEstimationResult {
  document_face_age: number | null;
  live_face_age: number | null;
  declared_age: number | null;
  age_discrepancy: number | null;
}

// --- Session State ---
export interface SessionState {
  session_id: string;
  current_step: VerificationStatusType;
  issuing_country: string | null; // ISO 3166-1 alpha-2
  rejection_reason: RejectionReasonType | null;
  rejection_detail: string | null;
  front_extraction: FrontExtractionResult | null;
  back_extraction: BackExtractionResult | null;
  cross_validation: CrossValidationResult | null;
  face_match: FaceMatchResult | null;
  liveness: { passed: boolean; score: number } | null;
  deepfake_check: { isReal: boolean; realProbability: number; fakeProbability: number } | null;
  aml_screening: AMLScreeningSessionResult | null;
  age_estimation: AgeEstimationResult | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
