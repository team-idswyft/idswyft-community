import { z } from 'zod';

// ─── Confidence score: always 0.0–1.0 ───
const confidence = z.number().min(0).max(1);

// ─── Rejection Reasons (10 per spec) ───
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
]);

// ─── Verification Status (10 states per spec) ───
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

// ─── OCR Data from front document ───
const IDCardOCRSchema = z.object({
  full_name: z.string().min(1),
  date_of_birth: z.string().min(1),
  id_number: z.string().min(1),
  expiry_date: z.string().min(1),
  nationality: z.string().optional(),
  issuing_country: z.string().length(2).optional(), // ISO 3166-1 alpha-2
}).passthrough(); // Allow additional OCR fields

// ─── Front Extraction Result ───
export const FrontExtractionResultSchema = z.object({
  ocr: IDCardOCRSchema,
  face_embedding: z.array(z.number()).nullable(),
  face_confidence: confidence,
  ocr_confidence: confidence,
  mrz_from_front: z.array(z.string()).nullable(),
});

export type FrontExtractionResult = z.infer<typeof FrontExtractionResultSchema>;

// ─── QR/Barcode payload from back document ───
const QRPayloadSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  id_number: z.string().optional(),
  expiry_date: z.string().optional(),
  nationality: z.string().optional(),
}).passthrough(); // Allow additional barcode fields

// ─── MRZ Parse Result ───
const MRZResultSchema = z.object({
  raw_lines: z.array(z.string()),
  fields: z.record(z.string()).optional(),
  checksums_valid: z.boolean(),
}).passthrough();

// ─── Back Extraction Result ───
export const BackExtractionResultSchema = z.object({
  qr_payload: QRPayloadSchema.nullable(),
  mrz_result: MRZResultSchema.nullable(),
  barcode_format: z.enum(['PDF417', 'QR_CODE', 'DATA_MATRIX', 'CODE_128', 'MRZ_TD1', 'MRZ_TD2', 'MRZ_TD3']).nullable(),
  raw_barcode_data: z.string().nullable(),
});

export type BackExtractionResult = z.infer<typeof BackExtractionResultSchema>;

// ─── Per-field score in cross-validation ───
const FieldScoreSchema = z.object({
  score: confidence,
  passed: z.boolean(),
  weight: confidence,
});

// ─── Cross-Validation Result ───
export const CrossValidationResultSchema = z.object({
  overall_score: confidence,
  field_scores: z.record(FieldScoreSchema),
  has_critical_failure: z.boolean(),
  document_expired: z.boolean(),
  verdict: z.enum(['PASS', 'REVIEW', 'REJECT']),
});

export type CrossValidationResult = z.infer<typeof CrossValidationResultSchema>;

// ─── Live Capture Result ───
export const LiveCaptureResultSchema = z.object({
  face_embedding: z.array(z.number()).nullable(),
  face_confidence: confidence,
  liveness_passed: z.boolean(),
  liveness_score: confidence,
});

export type LiveCaptureResult = z.infer<typeof LiveCaptureResultSchema>;

// ─── Face Match Result ───
export const FaceMatchResultSchema = z.object({
  similarity_score: confidence,
  passed: z.boolean(),
  threshold_used: confidence,
});

export type FaceMatchResult = z.infer<typeof FaceMatchResultSchema>;

// ─── Gate Result (shared across all 5 gates) ───
export const GateResultSchema = z.object({
  passed: z.boolean(),
  rejection_reason: RejectionReasonEnum.nullable(),
  rejection_detail: z.string().nullable(),
  user_message: z.string().nullable(),
});

export type GateResult = z.infer<typeof GateResultSchema>;

// ─── Session State ───
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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
