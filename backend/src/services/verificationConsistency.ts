import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import { VerificationStateMachine, VerificationState, VerificationEvent } from './verificationStateMachine.js';

export class VerificationConsistencyService {
  private stateMachine = new VerificationStateMachine();
  
  /**
   * Atomically update verification state with consistency checks
   */
  async updateVerificationState(
    verificationId: string,
    event: VerificationEvent,
    updateData: any,
    context: any = {}
  ): Promise<{ success: boolean; error?: string }> {
    // Use database transaction for atomicity
    const { data, error } = await supabase.rpc('update_verification_with_state_check', {
      p_verification_id: verificationId,
      p_expected_states: this.getValidStatesForEvent(event),
      p_new_status: this.getTargetState(event, context),
      p_update_data: updateData
    });

    if (error) {
      logger.error('Failed to update verification state', {
        verificationId,
        event,
        error: error.message
      });
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Ensure all verification scores are recalculated consistently
   */
  async recalculateConsistentScores(verificationId: string): Promise<{
    face_match_score: number;
    liveness_score: number;
    cross_validation_score: number;
    confidence_score: number;
    final_status: VerificationState;
  }> {
    // Get all verification data
    const { data: verification } = await supabase
      .from('verification_requests')
      .select(`
        *,
        documents!documents_verification_request_id_fkey(*),
        selfies!selfies_verification_request_id_fkey(*)
      `)
      .eq('id', verificationId)
      .single();

    if (!verification) {
      throw new Error('Verification not found');
    }

    // Recalculate scores with consistent thresholds
    const isSandbox = verification.is_sandbox;
    const thresholds = this.getThresholds(isSandbox);

    const scores = {
      face_match_score: verification.face_match_score || 0,
      liveness_score: verification.liveness_score || 0,
      cross_validation_score: verification.cross_validation_score || 0,
      confidence_score: 0
    };

    // Calculate overall confidence score
    scores.confidence_score = this.calculateConfidenceScore(scores, verification.documents?.[0]);

    // Determine final status based on all scores
    const final_status = this.determineFinalStatus(scores, thresholds, verification);

    // Update database with consistent scores
    await supabase
      .from('verification_requests')
      .update({
        face_match_score: scores.face_match_score,
        liveness_score: scores.liveness_score,
        cross_validation_score: scores.cross_validation_score,
        confidence_score: scores.confidence_score,
        status: final_status,
        updated_at: new Date().toISOString()
      })
      .eq('id', verificationId);

    return { ...scores, final_status };
  }

  /**
   * Validate verification consistency across all components
   */
  async validateVerificationConsistency(verificationId: string): Promise<{
    isConsistent: boolean;
    notFound?: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Get verification with all related data
    const { data: verification } = await supabase
      .from('verification_requests')
      .select(`
        *,
        documents!documents_verification_request_id_fkey(*),
        selfies!selfies_verification_request_id_fkey(*)
      `)
      .eq('id', verificationId)
      .single();

    if (!verification) {
      return {
        isConsistent: false,
        notFound: true,
        issues: ['Verification not found'],
        recommendations: ['Ensure verification exists before validation']
      };
    }

    // Check 1: Status consistency with available data
    if (verification.status === 'verified' && !verification.live_capture_completed) {
      issues.push('Status is verified but live capture not completed');
      recommendations.push('Complete live capture before marking as verified');
    }

    if (verification.status === 'verified' && !verification.documents?.length) {
      issues.push('Status is verified but no documents uploaded');
      recommendations.push('Upload document before marking as verified');
    }

    // Check 2: Score consistency
    if (verification.face_match_score && verification.liveness_score) {
      const isSandbox = verification.is_sandbox;
      const thresholds = this.getThresholds(isSandbox);
      
      const expectedStatus = (
        verification.face_match_score >= thresholds.face_match &&
        verification.liveness_score >= thresholds.liveness
      ) ? 'verified' : 'failed';

      if (verification.status !== expectedStatus && verification.status !== 'manual_review') {
        issues.push(`Status ${verification.status} inconsistent with scores (face: ${verification.face_match_score}, liveness: ${verification.liveness_score})`);
        recommendations.push(`Status should be ${expectedStatus} based on current scores`);
      }
    }

    // Check 3: Cross-validation consistency
    if (verification.enhanced_verification_completed && verification.cross_validation_score) {
      if (verification.cross_validation_score < 0.7 && verification.status === 'verified') {
        issues.push('Cross-validation score too low for verified status');
        recommendations.push('Review cross-validation results or mark for manual review');
      }
    }

    // Check 4: Document consistency
    const frontDoc = verification.documents?.find((d: any) => !d.is_back_of_id);
    const backDoc = verification.documents?.find((d: any) => d.is_back_of_id);

    if (frontDoc && backDoc && frontDoc.ocr_data && backDoc.barcode_data) {
      if (!frontDoc.cross_validation_results) {
        issues.push('Front and back documents exist but cross-validation not performed');
        recommendations.push('Perform cross-validation between front and back ID data');
      }
    }

    return {
      isConsistent: issues.length === 0,
      issues,
      recommendations
    };
  }

  private getThresholds(isSandbox: boolean) {
    return {
      face_match: isSandbox ? 0.8 : 0.85,
      liveness: isSandbox ? 0.65 : 0.75,
      cross_validation: 0.7,
      document_quality: isSandbox ? 0.4 : 0.5
    };
  }

  private calculateConfidenceScore(scores: any, document: any): number {
    let confidence = 0;
    let factors = 0;

    if (scores.face_match_score > 0) {
      confidence += scores.face_match_score * 0.4;
      factors += 0.4;
    }

    if (scores.liveness_score > 0) {
      confidence += scores.liveness_score * 0.3;
      factors += 0.3;
    }

    if (scores.cross_validation_score > 0) {
      confidence += scores.cross_validation_score * 0.2;
      factors += 0.2;
    }

    if (document?.quality_analysis?.overall_score) {
      confidence += document.quality_analysis.overall_score * 0.1;
      factors += 0.1;
    }

    return factors > 0 ? confidence / factors : 0;
  }

  private determineFinalStatus(scores: any, thresholds: any, verification: any): VerificationState {
    // Manual review takes precedence
    if (verification.manual_review_reason) {
      return 'manual_review';
    }

    // Check all required scores
    const faceMatchPass = scores.face_match_score >= thresholds.face_match;
    const livenessPass = scores.liveness_score >= thresholds.liveness;
    const crossValidationPass = !scores.cross_validation_score || scores.cross_validation_score >= thresholds.cross_validation;

    if (faceMatchPass && livenessPass && crossValidationPass) {
      return 'verified';
    } else {
      return 'failed';
    }
  }

  private getValidStatesForEvent(event: VerificationEvent): VerificationState[] {
    // This would map events to valid current states
    const stateMap: Record<VerificationEvent, VerificationState[]> = {
      'document_upload': ['pending'],
      'ocr_success': ['document_uploaded', 'ocr_processing'],
      'ocr_failure': ['document_uploaded', 'ocr_processing'],
      'back_id_upload': ['ocr_completed'],
      'cross_validation_success': ['back_id_processing'],
      'cross_validation_failure': ['back_id_processing'],
      'live_capture_upload': ['ocr_completed', 'cross_validation_completed'],
      'face_match_success': ['live_capture_processing', 'face_matching'],
      'face_match_failure': ['live_capture_processing', 'face_matching'],
      'liveness_success': ['liveness_checking'],
      'liveness_failure': ['liveness_checking'],
      'manual_review_required': ['pending', 'document_uploaded', 'ocr_processing', 'back_id_processing', 'live_capture_processing']
    };

    return stateMap[event] || [];
  }

  private getTargetState(event: VerificationEvent, context: any): VerificationState {
    const result = this.stateMachine.transition('pending', event, context);
    return result.newState;
  }
}

// Database function for atomic state updates (SQL)
export const createAtomicUpdateFunction = `
CREATE OR REPLACE FUNCTION update_verification_with_state_check(
  p_verification_id UUID,
  p_expected_states TEXT[],
  p_new_status TEXT,
  p_update_data JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  current_status TEXT;
BEGIN
  -- Lock the row and get current status
  SELECT status INTO current_status
  FROM verification_requests
  WHERE id = p_verification_id
  FOR UPDATE;
  
  -- Check if current state is valid for this transition
  IF current_status = ANY(p_expected_states) THEN
    -- Update with new data
    UPDATE verification_requests
    SET 
      status = p_new_status,
      face_match_score = COALESCE((p_update_data->>'face_match_score')::FLOAT, face_match_score),
      liveness_score = COALESCE((p_update_data->>'liveness_score')::FLOAT, liveness_score),
      cross_validation_score = COALESCE((p_update_data->>'cross_validation_score')::FLOAT, cross_validation_score),
      updated_at = NOW()
    WHERE id = p_verification_id;
    
    RETURN TRUE;
  ELSE
    -- Invalid state transition
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;
`;