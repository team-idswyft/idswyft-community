/**
 * Read-only utilities for fetching verification session state.
 * Extracted from newVerification.ts to avoid dragging in service singletons
 * (OCR, face detection, etc.) when only read access is needed.
 */
import { supabase } from '@/config/database.js';
import { VerificationStatus } from '@/verification/models/types.js';
import type { SessionState } from '@/verification/models/types.js';

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

/** Map 10-state VerificationStatus to backward-compatible response format */
export function mapStatusForResponse(state: Readonly<SessionState>): {
  status: string;
  current_step: number;
  total_steps: number;
  final_result: string | null;
} {
  const stepMap: Record<string, number> = {
    AWAITING_FRONT: 1,
    FRONT_PROCESSING: 1,
    AWAITING_BACK: 2,
    BACK_PROCESSING: 2,
    CROSS_VALIDATING: 3,
    AWAITING_LIVE: 4,
    LIVE_PROCESSING: 4,
    FACE_MATCHING: 5,
    COMPLETE: 5,
    HARD_REJECTED: 0,
  };

  let finalResult: string | null = null;
  if (state.current_step === VerificationStatus.COMPLETE) {
    finalResult = state.cross_validation?.verdict === 'REVIEW' ? 'manual_review' : 'verified';
  } else if (state.current_step === VerificationStatus.HARD_REJECTED) {
    finalResult = 'failed';
  }

  return {
    status: state.current_step,
    current_step: stepMap[state.current_step] ?? 0,
    total_steps: 5,
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
