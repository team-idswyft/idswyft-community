/**
 * Read-only utilities for fetching verification session state.
 * Extracted from newVerification.ts to avoid dragging in service singletons
 * (OCR, face detection, etc.) when only read access is needed.
 */
import { supabase } from '@/config/database.js';
import { VerificationStatus, FLOW_PRESETS } from '@idswyft/shared';
import type { SessionState, FlowConfig, VerificationMode } from '@idswyft/shared';

/** Load session state from verification_contexts table */
export async function loadSessionState(verificationId: string): Promise<SessionState | null> {
  const { data } = await supabase
    .from('verification_contexts')
    .select('context')
    .eq('verification_id', verificationId)
    .single();

  if (!data?.context) return null;
  return typeof data.context === 'string' ? JSON.parse(data.context) : data.context;
}

// ─── Step maps per flow ──────────────────────────────────────────
export const STEP_MAPS: Record<string, Record<string, number>> = {
  full: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    AWAITING_BACK: 2, BACK_PROCESSING: 2,
    CROSS_VALIDATING: 3,
    AWAITING_LIVE: 4, LIVE_PROCESSING: 4,
    FACE_MATCHING: 5,
    COMPLETE: 5, HARD_REJECTED: 0,
  },
  document_only: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    AWAITING_BACK: 2, BACK_PROCESSING: 2,
    CROSS_VALIDATING: 3,
    COMPLETE: 3, HARD_REJECTED: 0,
  },
  identity: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    AWAITING_LIVE: 2, LIVE_PROCESSING: 2,
    FACE_MATCHING: 3,
    COMPLETE: 3, HARD_REJECTED: 0,
  },
  liveness_only: {
    AWAITING_LIVE: 1, LIVE_PROCESSING: 1,
    FACE_MATCHING: 1,
    COMPLETE: 1, HARD_REJECTED: 0,
  },
  age_only: {
    AWAITING_FRONT: 1, FRONT_PROCESSING: 1,
    COMPLETE: 1, HARD_REJECTED: 0,
  },
};

/** Map 10-state VerificationStatus to backward-compatible response format */
export function mapStatusForResponse(
  state: Readonly<SessionState>,
  flow: FlowConfig = FLOW_PRESETS.full,
): {
  status: string;
  current_step: number;
  total_steps: number;
  final_result: string | null;
} {
  const stepMap = STEP_MAPS[flow.preset] ?? STEP_MAPS.full;

  let finalResult: string | null = null;
  if (state.current_step === VerificationStatus.COMPLETE) {
    if (flow.preset === 'age_only') {
      finalResult = 'verified';
    } else if (flow.preset === 'document_only') {
      // Document-only: final result based on cross-validation verdict alone
      // Passports skip cross-validation (single-sided) — verified if Gate 1 passed
      if (!state.cross_validation) {
        finalResult = 'verified';
      } else {
        const crossValVerdict = state.cross_validation.verdict;
        finalResult = crossValVerdict === 'REVIEW' ? 'manual_review'
          : crossValVerdict === 'REJECT' ? 'failed'
          : 'verified';
      }
    } else if (flow.preset === 'identity') {
      // Identity: no crossval, result based on face match only
      const needsReview = !!state.face_match?.skipped_reason;
      finalResult = needsReview ? 'manual_review' : 'verified';
    } else {
      // full / liveness_only: standard logic
      // Passports skip cross-validation, so only face match matters
      const needsReview = (state.cross_validation ? state.cross_validation.verdict === 'REVIEW' : false)
        || !!state.face_match?.skipped_reason;
      finalResult = needsReview ? 'manual_review' : 'verified';
    }
  } else if (state.current_step === VerificationStatus.HARD_REJECTED) {
    finalResult = 'failed';
  }

  return {
    status: state.current_step,
    current_step: stepMap[state.current_step] ?? 0,
    total_steps: flow.totalSteps,
    final_result: finalResult,
  };
}

/** Fetch computed risk score from verification_risk_scores table */
export async function fetchRiskScore(verificationId: string): Promise<{
  overall_score: number;
  risk_level: string;
  risk_factors: any[];
} | null> {
  const { data: riskRow } = await supabase
    .from('verification_risk_scores')
    .select('overall_score, risk_level, risk_factors')
    .eq('verification_request_id', verificationId)
    .single();

  if (!riskRow) return null;
  return {
    overall_score: riskRow.overall_score,
    risk_level: riskRow.risk_level,
    risk_factors: riskRow.risk_factors ?? [],
  };
}

// ─── Shared verification response builder ────────────────────────

export interface VerificationResponseInput {
  verificationId: string;
  state: SessionState;
  verification: {
    status: string;
    verification_mode?: string | null;
    is_sandbox?: boolean;
    duplicate_flags?: any;
    addons?: any;
    retry_count?: number;
    manual_review_reason?: string | null;
  };
  riskScore: { overall_score: number; risk_level: string; risk_factors: any[] } | null;
  flow?: FlowConfig;
}

/**
 * Build the canonical verification status response JSON.
 * Used by both GET /api/v2/verify/:id/status and GET /api/developer/verifications/:id.
 */
export function buildVerificationResponse(input: VerificationResponseInput) {
  const { verificationId, state, verification, riskScore } = input;
  const flow = input.flow ?? FLOW_PRESETS.full;
  const mapped = mapStatusForResponse(state, flow);
  const isAgeOnly = flow.preset === 'age_only';

  return {
    success: true,
    verification_id: verificationId,
    verification_mode: verification.verification_mode ?? null,
    is_sandbox: verification.is_sandbox ?? false,
    status: mapped.status,
    current_step: mapped.current_step,
    total_steps: mapped.total_steps,
    ...((state as any).age_verification && { age_verification: (state as any).age_verification }),
    front_document_uploaded: !!state.front_extraction,
    back_document_uploaded: !!state.back_extraction,
    live_capture_uploaded: !!state.face_match,
    ocr_data: isAgeOnly ? undefined : (state.front_extraction?.ocr ?? null),
    barcode_data: state.back_extraction?.qr_payload ?? null,
    cross_validation_results: state.cross_validation ?? null,
    face_match_results: state.face_match ?? null,
    liveness_results: state.liveness ?? null,
    deepfake_check: state.deepfake_check ?? null,
    aml_screening: state.aml_screening ?? null,
    age_estimation: state.age_estimation ?? null,
    velocity_analysis: state.velocity_analysis ?? null,
    geo_analysis: state.geo_analysis ?? null,
    risk_score: riskScore,
    compliance_flags: (verification.addons as any)?.compliance_flags ?? null,
    duplicate_flags: verification.duplicate_flags ?? null,
    barcode_extraction_failed: state.back_extraction ? !state.back_extraction.qr_payload : null,
    documents_match: state.cross_validation ? !state.cross_validation.has_critical_failure : null,
    face_match_passed: state.face_match?.passed ?? null,
    liveness_passed: state.liveness?.passed ?? null,
    final_result: ['verified', 'failed', 'manual_review'].includes(verification.status)
      ? verification.status
      : mapped.final_result,
    rejection_reason: state.rejection_reason,
    rejection_detail: state.rejection_detail,
    failure_reason: state.rejection_detail,
    manual_review_reason: verification.manual_review_reason
      || (state.cross_validation?.verdict === 'REVIEW' ? 'Cross-validation requires review' : null)
      || (state.face_match?.skipped_reason ? `Face match skipped: ${state.face_match.skipped_reason}` : null)
      || ((state.velocity_analysis?.flags?.length ?? 0) > 0 ? `Velocity flags: ${state.velocity_analysis!.flags.join(', ')}` : null)
      || ((state.geo_analysis?.flags?.length ?? 0) > 0 ? `Geo flags: ${state.geo_analysis!.flags.join(', ')}` : null),
    ...(mapped.final_result === 'failed' && {
      retry_available: (verification.retry_count ?? 0) < 3,
      retry_count: verification.retry_count ?? 0,
    }),
    created_at: state.created_at,
    updated_at: state.updated_at,
  };
}
