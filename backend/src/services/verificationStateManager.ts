/**
 * Verification State Manager
 * 
 * Centralized state management for verification processes to prevent race conditions
 * and ensure consistent state transitions across the verification flow.
 */

import { logger } from '@/utils/logger.js';
import { supabase } from '@/config/database.js';
import {
  VerificationStatus,
  VerificationStage,
  VerificationContext,
  VerificationError,
  VerificationResult,
  VerificationFailureType,
  VerificationErrorClassifier,
  StateTransition
} from '@/types/verificationTypes.js';
import {
  VERIFICATION_THRESHOLDS,
  validateScores,
  getThresholdInfo
} from '@/config/verificationThresholds.js';

/**
 * Write-through verification state store.
 *
 * Architecture:
 * - In-process Map: fast reads, avoids redundant DB round-trips within the same request
 * - Postgres `verification_contexts`: durable write-through so state survives Railway redeploys
 * - On a Map miss, context is restored from Postgres before falling back to null
 *
 * Locking (P3-F fix):
 * Promise-chaining queue — each lock chains off the tail of the current queue atomically.
 * There is no window between checking and claiming: `this.locks.set()` runs synchronously
 * before any `await`, so concurrent callers queue correctly.
 */
class VerificationStateStore {
  private states = new Map<string, VerificationContext>();
  // Each entry is the tail of the lock queue for that verification ID.
  private locks = new Map<string, Promise<void>>();

  async get(verificationId: string): Promise<VerificationContext | null> {
    // Fast path: in-process cache hit
    const cached = this.states.get(verificationId);
    if (cached) return cached;

    // Slow path: restore from Postgres (e.g. after a redeploy)
    try {
      const { data, error } = await supabase
        .from('verification_contexts')
        .select('context')
        .eq('verification_id', verificationId)
        .single();

      if (error || !data) return null;

      const context = data.context as VerificationContext;
      // Rehydrate Date fields that JSON serialisation turned into strings
      context.createdAt = new Date(context.createdAt);
      context.updatedAt = new Date(context.updatedAt);
      if (context.completedAt) context.completedAt = new Date(context.completedAt);

      this.states.set(verificationId, context);
      return context;
    } catch {
      return null;
    }
  }

  async set(verificationId: string, context: VerificationContext): Promise<void> {
    context.updatedAt = new Date();
    // Update in-process cache first (fast)
    this.states.set(verificationId, context);

    // Write-through to Postgres (durable)
    try {
      await supabase
        .from('verification_contexts')
        .upsert({ verification_id: verificationId, context }, { onConflict: 'verification_id' });
    } catch (err) {
      logger.warn('Failed to persist verification context to Postgres', {
        verificationId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: in-process cache is still valid; the next set() will retry
    }
  }

  async lock(verificationId: string): Promise<() => void> {
    // Promise-chaining queue: atomically append to the tail before awaiting.
    // No race window — the Map update is synchronous.
    const prev = this.locks.get(verificationId) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });

    // Chain: next waiter must wait for *this* lock, not just `prev`
    this.locks.set(verificationId, prev.then(() => current));

    // Wait our turn
    await prev;

    return () => {
      release();
      // Clean up map entry once our lock is released and no waiter follows
      if (this.locks.get(verificationId) === current) {
        this.locks.delete(verificationId);
      }
    };
  }

  async delete(verificationId: string): Promise<void> {
    this.states.delete(verificationId);
    this.locks.delete(verificationId);
    try {
      await supabase
        .from('verification_contexts')
        .delete()
        .eq('verification_id', verificationId);
    } catch {
      // Non-fatal: row will expire naturally
    }
  }
}

export class VerificationStateManager {
  private stateStore = new VerificationStateStore();
  
  /**
   * Initialize a new verification context
   */
  async initializeVerification(
    verificationId: string,
    userId: string,
    isSandbox: boolean
  ): Promise<VerificationContext> {
    const context: VerificationContext = {
      verificationId,
      userId,
      currentStatus: VerificationStatus.PENDING,
      currentStage: VerificationStage.DOCUMENT_UPLOAD,
      isSandbox,
      
      // Processing flags
      documentUploaded: false,
      backOfIdUploaded: false,
      liveCaptureCompleted: false,
      ocrCompleted: false,
      barcodeProcessingCompleted: false,
      crossValidationCompleted: false,
      faceMatchingCompleted: false,
      
      // Results
      scores: {},
      errors: [],
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await this.stateStore.set(verificationId, context);
    
    logger.info('Verification context initialized', {
      verificationId,
      userId,
      isSandbox,
      thresholds: getThresholdInfo(isSandbox)
    });
    
    return context;
  }
  
  /**
   * Update verification context with thread safety
   */
  async updateVerificationContext(
    verificationId: string,
    updates: Partial<VerificationContext>
  ): Promise<VerificationContext> {
    const release = await this.stateStore.lock(verificationId);
    
    try {
      const context = await this.stateStore.get(verificationId);
      if (!context) {
        throw new Error(`Verification context not found: ${verificationId}`);
      }
      
      const updatedContext = {
        ...context,
        ...updates,
        updatedAt: new Date()
      };
      
      await this.stateStore.set(verificationId, updatedContext);
      
      logger.debug('Verification context updated', {
        verificationId,
        updates: Object.keys(updates),
        newStatus: updatedContext.currentStatus,
        newStage: updatedContext.currentStage
      });
      
      return updatedContext;
      
    } finally {
      release();
    }
  }
  
  /**
   * Record a verification error
   */
  async recordError(
    verificationId: string,
    type: VerificationFailureType,
    stage: VerificationStage,
    message: string,
    technicalDetails?: any
  ): Promise<VerificationResult> {
    const release = await this.stateStore.lock(verificationId);
    
    try {
      const context = await this.stateStore.get(verificationId);
      if (!context) {
        throw new Error(`Verification context not found: ${verificationId}`);
      }
      
      const error = VerificationErrorClassifier.createError(
        type,
        stage,
        message,
        technicalDetails
      );
      
      const newStatus = VerificationErrorClassifier.getStatusForError(type);
      
      // Update inline — do NOT call updateVerificationContext() here because
      // this method already holds the lock; calling the public method would
      // try to re-acquire the same (non-reentrant) lock and deadlock.
      const updatedContext: VerificationContext = {
        ...context,
        currentStatus: newStatus,
        errors: [...context.errors, error],
        completedAt: [VerificationStatus.FAILED, VerificationStatus.VERIFIED].includes(newStatus)
          ? new Date() : undefined,
        updatedAt: new Date()
      };
      await this.stateStore.set(verificationId, updatedContext);

      logger.error('Verification error recorded', {
        verificationId,
        errorType: type,
        stage,
        newStatus,
        userMessage: error.userMessage,
        allowReupload: error.allowReupload,
        requiresManualReview: error.requiresManualReview,
        isFraudAlert: error.isFraudAlert
      });
      
      return this.buildVerificationResult(updatedContext);
      
    } finally {
      release();
    }
  }
  
  /**
   * Update scores and validate if verification can proceed
   */
  async updateScores(
    verificationId: string,
    newScores: Partial<Record<string, number>>
  ): Promise<VerificationResult> {
    const release = await this.stateStore.lock(verificationId);
    
    try {
      const context = await this.stateStore.get(verificationId);
      if (!context) {
        throw new Error(`Verification context not found: ${verificationId}`);
      }
      
      // Filter out undefined values to maintain Record<string, number> type
      const filteredNewScores = Object.fromEntries(
        Object.entries(newScores).filter(([_, value]) => value !== undefined)
      ) as Record<string, number>;
      
      const updatedScores = {
        ...context.scores,
        ...filteredNewScores
      };
      
      // Validate scores against thresholds
      const validation = await validateScores({
        photoConsistency: updatedScores.photoConsistency,
        faceMatching: updatedScores.faceMatching,
        liveness: updatedScores.liveness,
        crossValidation: updatedScores.crossValidation,
        quality: updatedScores.quality
      }, context.isSandbox);
      
      let newStatus = context.currentStatus;
      
      // Determine if we can finalize the verification
      if (this.canFinalizeVerification(context, updatedScores)) {
        newStatus = validation.overallPassed ? 
          VerificationStatus.VERIFIED : 
          VerificationStatus.FAILED;
        
        // Log detailed score analysis
        logger.info('Verification finalized with scores', {
          verificationId,
          scores: updatedScores,
          validation,
          finalStatus: newStatus,
          thresholds: getThresholdInfo(context.isSandbox)
        });
      }
      
      // Update inline — lock already held; calling updateVerificationContext would deadlock.
      const updatedContext: VerificationContext = {
        ...context,
        scores: updatedScores,
        currentStatus: newStatus,
        completedAt: [VerificationStatus.FAILED, VerificationStatus.VERIFIED].includes(newStatus)
          ? new Date() : undefined,
        updatedAt: new Date()
      };
      await this.stateStore.set(verificationId, updatedContext);

      return this.buildVerificationResult(updatedContext);
      
    } finally {
      release();
    }
  }
  
  /**
   * Mark a processing stage as complete
   */
  async completeStage(
    verificationId: string,
    stage: VerificationStage,
    success: boolean = true
  ): Promise<VerificationContext> {
    const stageFlagMap: Record<VerificationStage, keyof VerificationContext> = {
      [VerificationStage.DOCUMENT_UPLOAD]: 'documentUploaded',
      [VerificationStage.DOCUMENT_PROCESSING]: 'ocrCompleted',
      [VerificationStage.BACK_OF_ID_PROCESSING]: 'barcodeProcessingCompleted',
      [VerificationStage.CROSS_VALIDATION]: 'crossValidationCompleted',
      [VerificationStage.LIVE_CAPTURE]: 'liveCaptureCompleted',
      [VerificationStage.FACE_MATCHING]: 'faceMatchingCompleted',
      [VerificationStage.FINAL_VALIDATION]: 'faceMatchingCompleted'
    };
    
    const flagToUpdate = stageFlagMap[stage];
    if (!flagToUpdate) {
      throw new Error(`Unknown verification stage: ${stage}`);
    }
    
    return await this.updateVerificationContext(verificationId, {
      [flagToUpdate]: success,
      currentStage: this.getNextStage(stage)
    });
  }
  
  /**
   * Get verification result
   */
  async getVerificationResult(verificationId: string): Promise<VerificationResult | null> {
    const context = await this.stateStore.get(verificationId);
    if (!context) {
      return null;
    }
    
    return this.buildVerificationResult(context);
  }
  
  /**
   * Get verification context
   */
  async getVerificationContext(verificationId: string): Promise<VerificationContext | null> {
    return await this.stateStore.get(verificationId);
  }
  
  /**
   * Check if verification can be finalized
   */
  private canFinalizeVerification(
    context: VerificationContext,
    scores: Record<string, number>
  ): boolean {
    // Basic verification: need document OCR and live capture
    const basicRequirements = context.ocrCompleted && context.liveCaptureCompleted;
    
    // Enhanced verification: also need barcode processing and cross-validation
    const enhancedRequirements = context.backOfIdUploaded ? 
      (context.barcodeProcessingCompleted && context.crossValidationCompleted) : 
      true;
    
    // Must have required scores
    const hasRequiredScores = 'faceMatching' in scores && 'liveness' in scores;
    
    return basicRequirements && enhancedRequirements && hasRequiredScores;
  }
  
  /**
   * Get next stage in verification flow
   */
  private getNextStage(currentStage: VerificationStage): VerificationStage {
    const stageFlow = [
      VerificationStage.DOCUMENT_UPLOAD,
      VerificationStage.DOCUMENT_PROCESSING,
      VerificationStage.BACK_OF_ID_PROCESSING,
      VerificationStage.CROSS_VALIDATION,
      VerificationStage.LIVE_CAPTURE,
      VerificationStage.FACE_MATCHING,
      VerificationStage.FINAL_VALIDATION
    ];
    
    const currentIndex = stageFlow.indexOf(currentStage);
    return currentIndex < stageFlow.length - 1 ? 
      stageFlow[currentIndex + 1] : 
      currentStage;
  }
  
  /**
   * Build verification result from context
   */
  private buildVerificationResult(context: VerificationContext): VerificationResult {
    const completedStages = this.getCompletedStages(context);
    const nextSteps = this.getNextSteps(context);
    
    const result: VerificationResult = {
      status: context.currentStatus,
      verificationId: context.verificationId,
      userId: context.userId,
      stage: context.currentStage,
      scores: Object.keys(context.scores).length > 0 ? {
        photoConsistency: context.scores.photoConsistency,
        faceMatching: context.scores.faceMatching,
        liveness: context.scores.liveness,
        crossValidation: context.scores.crossValidation,
        quality: context.scores.quality,
        ocrConfidence: context.scores.ocrConfidence,
        pdf417Confidence: context.scores.pdf417Confidence
      } : undefined,
      error: context.errors.length > 0 ? context.errors[context.errors.length - 1] : undefined,
      completedStages,
      nextSteps,
      isSandbox: context.isSandbox,
      processingTime: context.completedAt ? 
        context.completedAt.getTime() - context.createdAt.getTime() : undefined
    };
    
    return result;
  }
  
  /**
   * Get completed stages from context
   */
  private getCompletedStages(context: VerificationContext): VerificationStage[] {
    const stages: VerificationStage[] = [];
    
    if (context.documentUploaded) stages.push(VerificationStage.DOCUMENT_UPLOAD);
    if (context.ocrCompleted) stages.push(VerificationStage.DOCUMENT_PROCESSING);
    if (context.barcodeProcessingCompleted) stages.push(VerificationStage.BACK_OF_ID_PROCESSING);
    if (context.crossValidationCompleted) stages.push(VerificationStage.CROSS_VALIDATION);
    if (context.liveCaptureCompleted) stages.push(VerificationStage.LIVE_CAPTURE);
    if (context.faceMatchingCompleted) stages.push(VerificationStage.FACE_MATCHING);
    
    return stages;
  }
  
  /**
   * Get next steps based on current context
   */
  private getNextSteps(context: VerificationContext): string[] {
    const steps: string[] = [];
    
    if (!context.documentUploaded) {
      steps.push('Upload document with POST /api/verify/document');
    } else if (!context.ocrCompleted) {
      steps.push('Document processing in progress');
    } else if (!context.backOfIdUploaded) {
      steps.push('Upload back-of-ID for enhanced verification with POST /api/verify/back-of-id (optional)');
    } else if (!context.barcodeProcessingCompleted) {
      steps.push('Back-of-ID processing in progress');
    } else if (!context.liveCaptureCompleted) {
      steps.push('Complete live capture with POST /api/verify/live-capture');
    } else if (!context.faceMatchingCompleted) {
      steps.push('Face matching in progress');
    }
    
    if (context.currentStatus === VerificationStatus.MANUAL_REVIEW) {
      steps.push('Manual review required - results will be updated when review is complete');
    }
    
    if (context.currentStatus === VerificationStatus.VERIFIED || 
        context.currentStatus === VerificationStatus.FAILED) {
      steps.push('Verification complete');
    }
    
    return steps;
  }
  
  /**
   * Clean up old verification contexts (should be called periodically)
   */
  async cleanupOldContexts(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    // This would be implemented with proper database cleanup in production
    // For now, just a placeholder
    logger.info('Cleanup old verification contexts', { maxAge });
    return 0;
  }
}