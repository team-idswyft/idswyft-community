/**
 * CUSTOMER PORTAL - VERIFICATION ENGINE
 *
 * Frontend state management that mirrors the backend verification algorithm exactly.
 * Provides synchronized status tracking and user feedback for each step.
 */

// EXACT SAME STATUS VALUES AS BACKEND
export type VerificationStatus =
  | 'pending'
  | 'front_document_uploaded'
  | 'front_document_processing'
  | 'front_document_processed'
  | 'back_document_uploaded'
  | 'back_document_processing'
  | 'back_document_processed'
  | 'cross_validation_processing'
  | 'cross_validation_completed'
  | 'live_capture_ready'
  | 'live_capture_uploaded'
  | 'live_capture_processing'
  | 'live_capture_completed'
  | 'verified'
  | 'failed'
  | 'manual_review';

export const VerificationStatusValues = {
  PENDING: 'pending' as const,
  FRONT_DOCUMENT_UPLOADED: 'front_document_uploaded' as const,
  FRONT_DOCUMENT_PROCESSING: 'front_document_processing' as const,
  FRONT_DOCUMENT_PROCESSED: 'front_document_processed' as const,
  BACK_DOCUMENT_UPLOADED: 'back_document_uploaded' as const,
  BACK_DOCUMENT_PROCESSING: 'back_document_processing' as const,
  BACK_DOCUMENT_PROCESSED: 'back_document_processed' as const,
  CROSS_VALIDATION_PROCESSING: 'cross_validation_processing' as const,
  CROSS_VALIDATION_COMPLETED: 'cross_validation_completed' as const,
  LIVE_CAPTURE_READY: 'live_capture_ready' as const,
  LIVE_CAPTURE_UPLOADED: 'live_capture_uploaded' as const,
  LIVE_CAPTURE_PROCESSING: 'live_capture_processing' as const,
  LIVE_CAPTURE_COMPLETED: 'live_capture_completed' as const,
  VERIFIED: 'verified' as const,
  FAILED: 'failed' as const,
  MANUAL_REVIEW: 'manual_review' as const
};

export interface VerificationState {
  id: string;
  status: VerificationStatus;
  currentStep: number;
  totalSteps: number;

  // Country / document type selection
  issuingCountry: string | null;     // ISO alpha-2
  selectedDocumentType: string | null; // e.g. 'drivers_license', 'passport', 'national_id'

  // Document upload states
  frontDocumentUploaded: boolean;
  backDocumentUploaded: boolean;
  liveCaptureUploaded: boolean;

  // Processing results available
  frontOcrAvailable: boolean;
  backBarcodeAvailable: boolean;
  crossValidationComplete: boolean;
  faceMatchComplete: boolean;

  // Algorithm decision flags
  barcodeExtractionFailed: boolean;
  documentsMatch: boolean;
  faceMatchPassed: boolean;
  livenessPassed: boolean;

  // User feedback
  isProcessing: boolean;
  canProceedToNext: boolean;
  errorMessage?: string;
  processingMessage: string;

  // Final result
  finalResult?: 'verified' | 'failed' | 'manual_review';
  resultMessage?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerPortalVerificationEngine {
  private state: VerificationState;
  private statusUpdateCallback?: (state: VerificationState) => void;
  private pollingInterval?: ReturnType<typeof setInterval>;

  constructor(verificationId: string) {
    this.state = {
      id: verificationId,
      status: VerificationStatusValues.PENDING,
      currentStep: 1,
      totalSteps: 8,

      issuingCountry: null,
      selectedDocumentType: null,

      frontDocumentUploaded: false,
      backDocumentUploaded: false,
      liveCaptureUploaded: false,

      frontOcrAvailable: false,
      backBarcodeAvailable: false,
      crossValidationComplete: false,
      faceMatchComplete: false,

      barcodeExtractionFailed: false,
      documentsMatch: false,
      faceMatchPassed: false,
      livenessPassed: false,

      isProcessing: false,
      canProceedToNext: false,
      processingMessage: 'Ready to start verification',

      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Set callback for UI updates
   */
  onStatusUpdate(callback: (state: VerificationState) => void): void {
    this.statusUpdateCallback = callback;
  }

  /**
   * Get current state
   */
  getState(): VerificationState {
    return { ...this.state };
  }

  /**
   * STEP 1: Initialize verification — prompt for country selection
   */
  async initializeVerification(): Promise<void> {
    this.updateState({
      status: VerificationStatusValues.PENDING,
      currentStep: 1,
      processingMessage: 'Please select the country that issued your document',
      canProceedToNext: true
    });
  }

  /**
   * STEP 2: Set issuing country
   */
  setCountry(countryCode: string): void {
    this.updateState({
      issuingCountry: countryCode.toUpperCase(),
      currentStep: 2,
      processingMessage: 'Please select your document type',
      canProceedToNext: true
    });
  }

  /**
   * STEP 3: Set document type
   */
  setDocumentType(documentType: string): void {
    this.updateState({
      selectedDocumentType: documentType,
      currentStep: 3,
      processingMessage: 'Ready to upload front document',
      canProceedToNext: true
    });
  }

  /**
   * Go back to country selection
   */
  goBackToCountry(): void {
    this.updateState({
      issuingCountry: null,
      selectedDocumentType: null,
      currentStep: 1,
      processingMessage: 'Please select the country that issued your document',
      canProceedToNext: true
    });
  }

  /**
   * STEP 4: Upload front document
   */
  async uploadFrontDocument(file: File): Promise<void> {
    this.updateState({
      status: VerificationStatusValues.FRONT_DOCUMENT_UPLOADED,
      frontDocumentUploaded: true,
      isProcessing: true,
      canProceedToNext: false,
      processingMessage: 'Uploading front document...'
    });

    try {
      // API call to upload document
      await this.callBackendAPI('/api/verify/front-document', file);

      // Start processing status
      this.updateState({
        status: VerificationStatusValues.FRONT_DOCUMENT_PROCESSING,
        currentStep: 4,
        processingMessage: 'Processing front document with OCR...'
      });

      // Start polling for OCR completion
      this.startPollingForStatus(VerificationStatusValues.FRONT_DOCUMENT_PROCESSED);

    } catch (error) {
      this.updateState({
        isProcessing: false,
        errorMessage: `Front document upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        canProceedToNext: false
      });
      throw error;
    }
  }

  /**
   * STEP 5: Upload back document
   */
  async uploadBackDocument(file: File): Promise<void> {
    if (!this.state.frontOcrAvailable) {
      throw new Error('Front document must be processed before uploading back document');
    }

    this.updateState({
      status: VerificationStatusValues.BACK_DOCUMENT_UPLOADED,
      backDocumentUploaded: true,
      isProcessing: true,
      canProceedToNext: false,
      processingMessage: 'Uploading back document...'
    });

    try {
      // API call to upload back document
      await this.callBackendAPI('/api/verify/back-document', file);

      // Start processing status
      this.updateState({
        status: VerificationStatusValues.BACK_DOCUMENT_PROCESSING,
        currentStep: 5,
        processingMessage: 'Processing back document with barcode scanning...'
      });

      // Start polling for barcode completion
      this.startPollingForStatus(VerificationStatusValues.BACK_DOCUMENT_PROCESSED);

    } catch (error) {
      this.updateState({
        isProcessing: false,
        errorMessage: `Back document upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        canProceedToNext: false
      });
      throw error;
    }
  }

  /**
   * STEP 6: Cross-validation (automatic after back document)
   */
  private async performCrossValidation(): Promise<void> {
    this.updateState({
      status: VerificationStatusValues.CROSS_VALIDATION_PROCESSING,
      currentStep: 6,
      processingMessage: 'Cross-validating front and back documents...'
    });

    // Poll for cross-validation completion
    this.startPollingForStatus(VerificationStatusValues.CROSS_VALIDATION_COMPLETED);
  }

  /**
   * STEP 7: Upload live capture
   */
  async uploadLiveCapture(imageData: string): Promise<void> {
    if (!this.state.crossValidationComplete) {
      throw new Error('Cross-validation must be completed before live capture');
    }

    this.updateState({
      status: VerificationStatusValues.LIVE_CAPTURE_UPLOADED,
      liveCaptureUploaded: true,
      isProcessing: true,
      canProceedToNext: false,
      processingMessage: 'Uploading live capture...'
    });

    try {
      // API call to upload live capture
      await this.callBackendAPI('/api/verify/live-capture', imageData);

      // Start processing status
      this.updateState({
        status: VerificationStatusValues.LIVE_CAPTURE_PROCESSING,
        currentStep: 7,
        processingMessage: 'Processing live capture - face matching and liveness detection...'
      });

      // Start polling for live capture completion
      this.startPollingForStatus(VerificationStatusValues.LIVE_CAPTURE_COMPLETED);

    } catch (error) {
      this.updateState({
        isProcessing: false,
        errorMessage: `Live capture upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        canProceedToNext: false
      });
      throw error;
    }
  }

  /**
   * Status polling mechanism
   */
  private startPollingForStatus(targetStatus: VerificationStatus): void {
    this.stopPolling();

    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max

    this.pollingInterval = setInterval(async () => {
      attempts++;

      try {
        const backendState = await this.fetchBackendStatus();
        this.syncWithBackendState(backendState);

        // Check if we've reached the target status or a final state
        if (
          this.state.status === targetStatus ||
          this.state.status === VerificationStatusValues.VERIFIED ||
          this.state.status === VerificationStatusValues.FAILED ||
          this.state.status === VerificationStatusValues.MANUAL_REVIEW
        ) {
          this.stopPolling();
          this.handleStatusTransition();
        }

        if (attempts >= maxAttempts) {
          this.stopPolling();
          this.updateState({
            isProcessing: false,
            errorMessage: 'Processing timeout - please refresh and try again',
            canProceedToNext: false
          });
        }

      } catch (error) {
        console.error('Polling error:', error);
        if (attempts >= 3) {
          this.stopPolling();
          this.updateState({
            isProcessing: false,
            errorMessage: 'Unable to check processing status - please refresh',
            canProceedToNext: false
          });
        }
      }
    }, 10000); // Poll every 10 seconds
  }

  /**
   * Sync frontend state with backend response
   */
  private syncWithBackendState(backendState: any): void {
    const updates: Partial<VerificationState> = {
      status: backendState.status,
      updatedAt: new Date()
    };

    // Update processing flags based on backend state
    if (backendState.frontOcrData) {
      updates.frontOcrAvailable = true;
    }

    if (backendState.backBarcodeData) {
      updates.backBarcodeAvailable = true;
      updates.barcodeExtractionFailed = Object.keys(backendState.backBarcodeData).length === 0;
    }

    if (backendState.crossValidationResults) {
      updates.crossValidationComplete = true;
      updates.documentsMatch = backendState.crossValidationResults.overallMatch;
    }

    if (backendState.faceMatchResults) {
      updates.faceMatchComplete = true;
      updates.faceMatchPassed = backendState.faceMatchResults.passed;
    }

    if (backendState.livenessResults) {
      updates.livenessPassed = backendState.livenessResults.passed;
    }

    this.updateState(updates);
  }

  /**
   * Handle status transitions and next steps
   */
  private handleStatusTransition(): void {
    switch (this.state.status) {
      case VerificationStatusValues.FRONT_DOCUMENT_PROCESSED:
        this.updateState({
          isProcessing: false,
          canProceedToNext: true,
          processingMessage: 'Front document processed successfully - ready to upload back document'
        });
        break;

      case VerificationStatusValues.BACK_DOCUMENT_PROCESSED:
        // Automatically start cross-validation
        this.performCrossValidation();
        break;

      case VerificationStatusValues.CROSS_VALIDATION_COMPLETED:
        if (this.state.documentsMatch) {
          this.updateState({
            isProcessing: false,
            canProceedToNext: true,
            currentStep: 7,
            processingMessage: 'Documents validated successfully - ready for live capture'
          });
        } else {
          // Documents don't match - automatic failure
          this.updateState({
            status: VerificationStatusValues.FAILED,
            isProcessing: false,
            canProceedToNext: false,
            finalResult: 'failed',
            resultMessage: 'Verification failed: Front and back documents do not match'
          });
        }
        break;

      case VerificationStatusValues.LIVE_CAPTURE_COMPLETED:
        // Automatically determine final result
        this.determineFinalResult();
        break;

      case VerificationStatusValues.VERIFIED:
        this.updateState({
          isProcessing: false,
          canProceedToNext: false,
          currentStep: 8,
          finalResult: 'verified',
          resultMessage: 'Verification completed successfully! Your identity has been verified.'
        });
        break;

      case VerificationStatusValues.FAILED:
        this.updateState({
          isProcessing: false,
          canProceedToNext: false,
          currentStep: 8,
          finalResult: 'failed',
          resultMessage: this.state.errorMessage || 'Verification failed. Please try again with valid documents.'
        });
        break;

      case VerificationStatusValues.MANUAL_REVIEW:
        this.updateState({
          isProcessing: false,
          canProceedToNext: false,
          currentStep: 8,
          finalResult: 'manual_review',
          resultMessage: 'Your verification requires manual review. You will be notified of the result within 24 hours.'
        });
        break;
    }
  }

  /**
   * Determine final result based on algorithm
   */
  private determineFinalResult(): void {
    if (this.state.barcodeExtractionFailed) {
      this.updateState({
        status: VerificationStatusValues.MANUAL_REVIEW,
        resultMessage: 'Barcode extraction failed - manual review required'
      });
    } else if (!this.state.faceMatchPassed) {
      this.updateState({
        status: VerificationStatusValues.FAILED,
        resultMessage: 'Face matching failed - selfie does not match document photo'
      });
    } else if (!this.state.livenessPassed) {
      this.updateState({
        status: VerificationStatusValues.FAILED,
        resultMessage: 'Liveness detection failed - live person not detected'
      });
    } else {
      this.updateState({
        status: VerificationStatusValues.VERIFIED,
        resultMessage: 'All verification checks passed successfully'
      });
    }
  }

  /**
   * Update state and notify UI
   */
  private updateState(updates: Partial<VerificationState>): void {
    this.state = { ...this.state, ...updates };
    if (this.statusUpdateCallback) {
      this.statusUpdateCallback(this.state);
    }
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  /**
   * Backend API calls
   */
  private async callBackendAPI(endpoint: string, data: any): Promise<any> {
    // TODO: Implement actual API calls
    console.log(`API call: ${endpoint}`, data);
  }

  private async fetchBackendStatus(): Promise<any> {
    // TODO: Implement status fetching
    console.log('Fetching backend status...');
    return {};
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopPolling();
  }
}