// DEPRECATED: This controller is replaced by NewVerificationEngine
// Clean verification flow controller implementing the exact algorithm

// @ts-nocheck
/* eslint-disable */

import { VerificationStep, VerificationStatus } from '../../types/verification';
import { VerificationStateManager } from './VerificationStateManager';
import { VerificationSession } from '../../types';
import newVerificationApi from '../../services/newVerificationApi';

export class VerificationController {
  private stateManager: VerificationStateManager;
  private session: VerificationSession | null = null;

  constructor(stateManager: VerificationStateManager) {
    this.stateManager = stateManager;
  }

  setSession(session: VerificationSession) {
    this.session = session;
  }

  // Algorithm Step 1: Verification Start
  async startVerification(): Promise<void> {
    console.log('🚀 Step 1: Starting verification...');

    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.stateManager.moveToStep(VerificationStep.FRONT_DOCUMENT_UPLOAD, VerificationStatus.PENDING);

    try {
      const verificationId = await newVerificationApi.startVerification(this.session);
      this.stateManager.setVerificationId(verificationId);
      console.log('✅ Step 1 Complete: Verification started with ID:', verificationId);
    } catch (error) {
      console.error('❌ Step 1 Failed:', error);
      this.stateManager.setError(`Failed to start verification: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Algorithm Step 2: Upload Frontend Document
  async uploadFrontDocument(file: File, documentType: string): Promise<void> {
    console.log('📄 Step 2: Uploading front document...');

    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) {
      throw new Error('Verification not started');
    }

    this.stateManager.setFrontDocument(file, documentType);
    this.stateManager.moveToStep(VerificationStep.FRONT_DOCUMENT_UPLOAD, VerificationStatus.PROCESSING);

    try {
      await newVerificationApi.uploadFrontDocument(this.session, state.verificationId, file, documentType);
      this.stateManager.setFrontDocumentUploaded();
      console.log('✅ Step 2 Complete: Front document uploaded');

      // Move to processing step
      this.moveToFrontDocumentProcessing();
    } catch (error) {
      console.error('❌ Step 2 Failed:', error);
      this.stateManager.setError(`Failed to upload front document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Algorithm Step 3: Front Document Processing
  private moveToFrontDocumentProcessing(): void {
    console.log('⚙️ Step 3: Processing front document...');
    this.stateManager.moveToStep(VerificationStep.FRONT_DOCUMENT_PROCESSING, VerificationStatus.PROCESSING);

    // Start polling for OCR completion
    this.pollForFrontDocumentProcessing();
  }

  private async pollForFrontDocumentProcessing(): Promise<void> {
    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) return;

    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔄 Polling front document processing (${attempts}/${maxAttempts})...`);

        const results = await newVerificationApi.getVerificationResults(this.session!, state.verificationId!);

        // Check if OCR data is available
        if (results.ocr_data && Object.keys(results.ocr_data).length > 0) {
          console.log('✅ Step 3 Complete: Front document processed');
          this.stateManager.setFrontDocumentProcessed(results.ocr_data);

          // Move to next step: Upload Back Document
          this.stateManager.moveToStep(VerificationStep.BACK_DOCUMENT_UPLOAD, VerificationStatus.PENDING);
          return;
        }

        if (attempts >= maxAttempts) {
          throw new Error('Front document processing timeout');
        }

        // Continue polling
        setTimeout(poll, 10000); // Poll every 10 seconds
      } catch (error) {
        console.error('❌ Step 3 Failed:', error);
        this.stateManager.setError(`Front document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    poll();
  }

  // Algorithm Step 4: Upload Back of ID
  async uploadBackDocument(file: File, documentType: string): Promise<void> {
    console.log('📄 Step 4: Uploading back document...');

    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) {
      throw new Error('Verification not ready for back document');
    }

    if (!this.stateManager.canMoveToBackDocumentUpload()) {
      throw new Error('Front document must be processed first');
    }

    this.stateManager.setBackDocument(file, documentType);
    this.stateManager.moveToStep(VerificationStep.BACK_DOCUMENT_UPLOAD, VerificationStatus.PROCESSING);

    try {
      await newVerificationApi.uploadBackDocument(this.session, state.verificationId, file, documentType);
      this.stateManager.setBackDocumentUploaded();
      console.log('✅ Step 4 Complete: Back document uploaded');

      // Move to processing step
      this.moveToBackDocumentProcessing();
    } catch (error) {
      console.error('❌ Step 4 Failed:', error);
      this.stateManager.setError(`Failed to upload back document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Algorithm Step 5: Back Document Processing
  private moveToBackDocumentProcessing(): void {
    console.log('⚙️ Step 5: Processing back document...');
    this.stateManager.moveToStep(VerificationStep.BACK_DOCUMENT_PROCESSING, VerificationStatus.PROCESSING);

    // Start polling for barcode/QR processing completion
    this.pollForBackDocumentProcessing();
  }

  private async pollForBackDocumentProcessing(): Promise<void> {
    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) return;

    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔄 Polling back document processing (${attempts}/${maxAttempts})...`);

        const results = await newVerificationApi.getVerificationResults(this.session!, state.verificationId!);

        // Check if back document processing is complete
        // Back document is processed if it's uploaded and either has barcode data or processing is complete
        const backDocumentProcessed = results.back_document_uploaded &&
                                     (results.barcode_data ||
                                      results.cross_validation_results ||
                                      (results.cross_validation_results?.score !== null));

        if (backDocumentProcessed) {
          console.log('✅ Step 5 Complete: Back document processed', {
            back_of_id_uploaded: results.back_of_id_uploaded,
            has_barcode_data: !!results.barcode_data,
            enhanced_verification_completed: results.enhanced_verification_completed,
            cross_validation_score: results.cross_validation_score
          });

          this.stateManager.setBackDocumentProcessed(results.barcode_data);

          // Move to cross validation
          this.moveToCrossValidation();
          return;
        }

        if (attempts >= maxAttempts) {
          throw new Error('Back document processing timeout');
        }

        // Continue polling
        setTimeout(poll, 10000); // Poll every 10 seconds
      } catch (error) {
        console.error('❌ Step 5 Failed:', error);
        this.stateManager.setError(`Back document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    poll();
  }

  // Algorithm Step 6: Cross Validation
  private moveToCrossValidation(): void {
    console.log('🔀 Step 6: Cross validation...');
    this.stateManager.moveToStep(VerificationStep.CROSS_VALIDATION, VerificationStatus.PROCESSING);

    // Start polling for cross validation completion
    this.pollForCrossValidation();
  }

  private async pollForCrossValidation(): Promise<void> {
    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) return;

    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔄 Polling cross validation (${attempts}/${maxAttempts})...`);

        const results = await newVerificationApi.getVerificationResults(this.session!, state.verificationId!);

        // Check multiple indicators for cross validation completion
        const crossValidationComplete = results.enhanced_verification_completed ||
                                       (results.cross_validation_score !== null && results.cross_validation_score !== undefined) ||
                                       (results.status === 'verified' && results.back_of_id_uploaded) ||
                                       (results.status === 'failed' && results.back_of_id_uploaded);

        if (crossValidationComplete) {
          console.log('✅ Step 6 Complete: Cross validation finished', {
            enhanced_verification_completed: results.enhanced_verification_completed,
            cross_validation_score: results.cross_validation_score,
            status: results.status,
            back_of_id_uploaded: results.back_of_id_uploaded
          });

          // Determine if cross validation passed
          let crossValidationPassed = false;
          if (results.status === 'verified') {
            crossValidationPassed = true;
          } else if (results.status === 'failed') {
            crossValidationPassed = false;
          } else if (results.cross_validation_score !== null && results.cross_validation_score !== undefined) {
            crossValidationPassed = results.cross_validation_score >= 0.7;
          }

          this.stateManager.setCrossValidationCompleted(
            crossValidationPassed,
            results.cross_validation_score || 0,
            results.cross_validation_results
          );

          if (crossValidationPassed) {
            // Move to live capture
            console.log('🎯 Cross validation passed - moving to live capture');
            this.stateManager.moveToStep(VerificationStep.LIVE_CAPTURE, VerificationStatus.PENDING);
          } else {
            // Cross validation failed - set final result
            console.log('❌ Cross validation failed - setting final result');
            this.stateManager.setFinalResult('failed', results.failure_reason || 'Cross validation failed');
          }
          return;
        }

        // Log current status for debugging
        console.log('🔍 Cross validation status check:', {
          attempt: attempts,
          maxAttempts,
          enhanced_verification_completed: results.enhanced_verification_completed,
          cross_validation_score: results.cross_validation_score,
          status: results.status,
          back_of_id_uploaded: results.back_of_id_uploaded,
          crossValidationComplete
        });

        if (attempts >= maxAttempts) {
          console.error('⏰ Cross validation timeout - max attempts reached');
          this.stateManager.setError('Cross validation timeout - the process is taking longer than expected. Please try again or contact support.');
          return;
        }

        // Continue polling
        setTimeout(poll, 10000); // Poll every 10 seconds
      } catch (error) {
        console.error('❌ Step 6 Failed:', error);
        this.stateManager.setError(`Cross validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    poll();
  }

  // Algorithm Step 7: Live Capture
  async captureLiveSelfie(imageData: string, livenessMetadata?: unknown): Promise<void> {
    console.log('📸 Step 7: Live capture...');

    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) {
      throw new Error('Verification not ready for live capture');
    }

    if (!this.stateManager.canMoveToLiveCapture()) {
      throw new Error('Cross validation must pass first');
    }

    this.stateManager.moveToStep(VerificationStep.LIVE_CAPTURE, VerificationStatus.PROCESSING);

    try {
      await newVerificationApi.captureLiveSelfie(this.session, state.verificationId, imageData, livenessMetadata);
      this.stateManager.setLiveCaptureCompleted();
      console.log('✅ Step 7 Complete: Live capture uploaded');

      // Move to processing
      this.moveToLiveCaptureProcessing();
    } catch (error) {
      console.error('❌ Step 7 Failed:', error);
      this.stateManager.setError(`Live capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Algorithm Step 8: Live Capture Processing & Final Result
  private moveToLiveCaptureProcessing(): void {
    console.log('⚙️ Step 8: Processing live capture...');
    this.stateManager.moveToStep(VerificationStep.LIVE_CAPTURE_PROCESSING, VerificationStatus.PROCESSING);

    // Start polling for final results
    this.pollForFinalResults();
  }

  private async pollForFinalResults(): Promise<void> {
    const state = this.stateManager.getState();
    if (!state.verificationId || !this.session) return;

    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔄 Polling final results (${attempts}/${maxAttempts})...`);

        const results = await newVerificationApi.getVerificationResults(this.session!, state.verificationId!);

        // FIXED: Check if verification has reached a final status (verified, failed, or manual_review)
        // Don't require face_match_score and liveness_score for manual_review cases
        const isFinalStatus = results.status === 'verified' || results.status === 'failed' || results.status === 'manual_review';
        const hasRequiredScores = results.face_match_score !== undefined && results.liveness_score !== undefined;

        if (results.live_capture_completed && (hasRequiredScores || results.status === 'manual_review')) {

          console.log('✅ Step 8 Complete: Live capture processed', {
            status: results.status,
            hasScores: hasRequiredScores,
            faceMatchScore: results.face_match_score,
            livenessScore: results.liveness_score
          });

          // Set scores if available, otherwise use default values for manual review
          const faceScore = results.face_match_score ?? 0;
          const livenessScore = results.liveness_score ?? 0;
          this.stateManager.setLiveCaptureProcessed(faceScore, livenessScore);

          // Set final result based on overall status
          if (results.status === 'verified') {
            this.stateManager.setFinalResult('verified');
          } else if (results.status === 'failed') {
            this.stateManager.setFinalResult('failed', results.failure_reason);
          } else if (results.status === 'manual_review') {
            this.stateManager.setFinalResult('manual_review', results.manual_review_reason);
          }

          console.log('🎉 Verification Algorithm Complete!');
          return;
        }

        if (attempts >= maxAttempts) {
          throw new Error('Live capture processing timeout');
        }

        // Continue polling
        setTimeout(poll, 10000); // Poll every 10 seconds
      } catch (error) {
        console.error('❌ Step 8 Failed:', error);
        this.stateManager.setError(`Live capture processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    poll();
  }

  // Manual step transitions (for UI controls)
  moveToStepManually(step: VerificationStep): void {
    const state = this.stateManager.getState();

    switch (step) {
      case VerificationStep.BACK_DOCUMENT_UPLOAD:
        if (this.stateManager.canMoveToBackDocumentUpload()) {
          this.stateManager.moveToStep(step, VerificationStatus.PENDING);
        } else {
          throw new Error('Front document must be processed first');
        }
        break;

      case VerificationStep.LIVE_CAPTURE:
        if (this.stateManager.canMoveToLiveCapture()) {
          this.stateManager.moveToStep(step, VerificationStatus.PENDING);
        } else {
          throw new Error('Cross validation must pass first');
        }
        break;

      default:
        this.stateManager.moveToStep(step, VerificationStatus.PENDING);
    }
  }
}