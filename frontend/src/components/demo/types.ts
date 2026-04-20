export interface DemoDocument {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  ocr_data?: {
    document_number?: string;
    full_name?: string;
    date_of_birth?: string;
    expiry_date?: string;
    nationality?: string;
    place_of_birth?: string;
  };
}

export interface VerificationRequest {
  id: string;
  verification_id?: string;
  status: string;
  current_step?: string;
  total_steps?: number;
  verification_mode?: 'full' | 'document_only' | 'identity' | 'age_only' | null;
  final_result?: 'verified' | 'failed' | 'manual_review' | null;
  documents: DemoDocument[];
  selfie_id?: string;
  created_at: string;
  updated_at: string;
  ocr_data?: {
    document_number?: string;
    full_name?: string;
    date_of_birth?: string;
    expiry_date?: string;
    nationality?: string;
    place_of_birth?: string;
    id_number?: string;
    [key: string]: any;
  };
  cross_validation_results?: {
    overall_score?: number;
    field_scores?: Record<string, { score: number; passed: boolean; weight: number }>;
    has_critical_failure?: boolean;
    document_expired?: boolean;
    verdict?: 'PASS' | 'REVIEW' | 'REJECT';
  } | null;
  face_match_results?: {
    similarity_score?: number;
    passed?: boolean;
    threshold_used?: number;
  } | null;
  liveness_results?: {
    passed?: boolean;
    score?: number;
  } | null;
  aml_screening?: {
    risk_level?: string;
    match_found?: boolean;
    match_count?: number;
    lists_checked?: string[];
    screened_at?: string;
  } | null;
  age_estimation?: {
    document_face_age: number | null;
    live_face_age: number | null;
    declared_age: number | null;
    age_discrepancy: number | null;
  } | null;
  risk_score?: {
    overall_score?: number;
    risk_level?: string;
    risk_factors?: Array<{ factor: string; score: number; weight: number }>;
  } | null;
  rejection_reason?: string | null;
  rejection_detail?: string | null;
  failure_reason?: string | null;
  front_document_uploaded?: boolean;
  back_document_uploaded?: boolean;
  live_capture_uploaded?: boolean;
  barcode_data?: any;
  barcode_extraction_failed?: boolean | null;
  documents_match?: boolean | null;
  face_match_passed?: boolean | null;
  liveness_passed?: boolean | null;
  manual_review_reason?: string | null;
  retry_available?: boolean;
  retry_count?: number;
}

export interface LiveCaptureSession {
  live_capture_token: string;
  expires_at: string;
  liveness_challenge: {
    type: string;
    instruction: string;
  };
  user_id: string;
  verification_id: string | null;
  expires_in_seconds: number;
}

export interface CaptureResult {
  verification_id: string;
  live_capture_id: string;
  status: string;
  message: string;
  liveness_check_enabled: boolean;
  face_matching_enabled: boolean;
}

export const getErrorMessage = (errorData: any, fallback: string): string => {
  if (!errorData) return fallback;
  if (typeof errorData === 'string') return errorData;
  if (typeof errorData.message === 'string') return errorData.message;
  if (typeof errorData.error === 'string') return errorData.error;
  if (errorData.error && typeof errorData.error.message === 'string') return errorData.error.message;
  if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
    const first = errorData.errors[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.msg === 'string') return first.msg;
  }
  return fallback;
};
