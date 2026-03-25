/**
 * Enhanced Error Classification System
 * 
 * Provides structured error types and failure classifications for the verification system
 * to enable proper routing and handling of different failure scenarios.
 */

/**
 * Classification of verification failure types
 */
export enum VerificationFailureType {
  // Technical failures - route to manual review
  TECHNICAL_FAILURE = 'technical_failure',
  OCR_EXTRACTION_FAILED = 'ocr_extraction_failed',
  PDF417_EXTRACTION_FAILED = 'pdf417_extraction_failed',
  IMAGE_PROCESSING_FAILED = 'image_processing_failed',
  FACE_RECOGNITION_TECHNICAL_ERROR = 'face_recognition_technical_error',
  
  // Fraud detected - hard failure
  FRAUD_DETECTED = 'fraud_detected',
  PHOTO_MISMATCH_FRAUD = 'photo_mismatch_fraud',
  DATA_INCONSISTENCY_FRAUD = 'data_inconsistency_fraud',
  DOCUMENT_TAMPERING = 'document_tampering',
  
  // Quality issues - allow reupload
  QUALITY_ISSUE = 'quality_issue',
  IMAGE_TOO_BLURRY = 'image_too_blurry',
  IMAGE_TOO_DARK = 'image_too_dark',
  DOCUMENT_INCOMPLETE = 'document_incomplete',
  
  // User behavior issues
  LIVENESS_FAILED = 'liveness_failed',
  FACE_NOT_MATCHING = 'face_not_matching',
  
  // Data extraction issues - manual review with specific reason
  EXTRACTION_FAILURE = 'extraction_failure',
  NO_COMPARABLE_DATA = 'no_comparable_data',
  PARTIAL_DATA_EXTRACTED = 'partial_data_extracted'
}

/**
 * Verification result status
 */
export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  FAILED = 'failed',
  MANUAL_REVIEW = 'manual_review'
}

/**
 * Processing stage for verification
 */
export enum VerificationStage {
  DOCUMENT_UPLOAD = 'document_upload',
  DOCUMENT_PROCESSING = 'document_processing',
  BACK_OF_ID_PROCESSING = 'back_of_id_processing',
  CROSS_VALIDATION = 'cross_validation',
  LIVE_CAPTURE = 'live_capture',
  FACE_MATCHING = 'face_matching',
  FINAL_VALIDATION = 'final_validation'
}

/**
 * Structured verification error with classification
 */
export interface VerificationError {
  type: VerificationFailureType;
  stage: VerificationStage;
  message: string;
  userMessage: string; // User-friendly message (no technical details)
  technicalDetails?: any;
  allowReupload: boolean;
  requiresManualReview: boolean;
  isFraudAlert: boolean;
  timestamp: Date;
}

/**
 * Verification result with enhanced error information
 */
export interface VerificationResult {
  status: VerificationStatus;
  verificationId: string;
  userId: string;
  stage: VerificationStage;
  
  // Score information
  scores?: {
    photoConsistency?: number;
    faceMatching?: number;
    liveness?: number;
    crossValidation?: number;
    quality?: number;
    ocrConfidence?: number;
    pdf417Confidence?: number;
  };
  
  // Error information (if failed)
  error?: VerificationError;
  
  // Success information
  completedStages?: VerificationStage[];
  nextSteps?: string[];
  
  // Additional metadata
  isSandbox: boolean;
  processingTime?: number;
  confidence?: number;
}

/**
 * State transition rules for verification flow
 */
export interface StateTransition {
  from: VerificationStatus;
  to: VerificationStatus;
  trigger: string;
  conditions?: Record<string, any>;
  actions?: string[];
}

/**
 * Verification context for state management
 */
export interface VerificationContext {
  verificationId: string;
  userId: string;
  currentStatus: VerificationStatus;
  currentStage: VerificationStage;
  isSandbox: boolean;
  
  // Processing flags
  documentUploaded: boolean;
  backOfIdUploaded: boolean;
  liveCaptureCompleted: boolean;
  ocrCompleted: boolean;
  barcodeProcessingCompleted: boolean;
  crossValidationCompleted: boolean;
  faceMatchingCompleted: boolean;
  
  // Results
  scores: Record<string, number>;
  errors: VerificationError[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * Helper functions for error classification
 */
export class VerificationErrorClassifier {
  /**
   * Create a structured verification error
   */
  static createError(
    type: VerificationFailureType,
    stage: VerificationStage,
    message: string,
    technicalDetails?: any
  ): VerificationError {
    const error: VerificationError = {
      type,
      stage,
      message,
      userMessage: this.getUserFriendlyMessage(type),
      technicalDetails,
      allowReupload: this.shouldAllowReupload(type),
      requiresManualReview: this.shouldRouteToManualReview(type),
      isFraudAlert: this.isFraudAlert(type),
      timestamp: new Date()
    };
    
    return error;
  }
  
  /**
   * Get user-friendly error message (no technical details)
   */
  static getUserFriendlyMessage(type: VerificationFailureType): string {
    const messages: Record<VerificationFailureType, string> = {
      [VerificationFailureType.TECHNICAL_FAILURE]: 'A technical issue occurred during verification. Our team will review your submission.',
      [VerificationFailureType.OCR_EXTRACTION_FAILED]: 'We had trouble reading your document. Please try uploading a clearer image.',
      [VerificationFailureType.PDF417_EXTRACTION_FAILED]: 'We had trouble reading the barcode on your document. Please try uploading a clearer image.',
      [VerificationFailureType.IMAGE_PROCESSING_FAILED]: 'We had trouble processing your image. Please try uploading again.',
      [VerificationFailureType.FACE_RECOGNITION_TECHNICAL_ERROR]: 'A technical issue occurred during face verification. Our team will review your submission.',
      
      [VerificationFailureType.FRAUD_DETECTED]: 'We detected inconsistencies in your documents. Please contact support.',
      [VerificationFailureType.PHOTO_MISMATCH_FRAUD]: 'The photos in your documents do not appear to be of the same person.',
      [VerificationFailureType.DATA_INCONSISTENCY_FRAUD]: 'The information on your documents does not match.',
      [VerificationFailureType.DOCUMENT_TAMPERING]: 'Your document appears to have been altered.',
      
      [VerificationFailureType.QUALITY_ISSUE]: 'The image quality is too low for verification. Please upload a clearer photo.',
      [VerificationFailureType.IMAGE_TOO_BLURRY]: 'Your image is too blurry. Please upload a clearer photo.',
      [VerificationFailureType.IMAGE_TOO_DARK]: 'Your image is too dark. Please upload a brighter photo.',
      [VerificationFailureType.DOCUMENT_INCOMPLETE]: 'Your document appears to be cut off or incomplete. Please upload the full document.',
      
      [VerificationFailureType.LIVENESS_FAILED]: 'We could not confirm you are a live person. Please try the live capture again.',
      [VerificationFailureType.FACE_NOT_MATCHING]: 'Your live photo does not match the photo in your document.',
      
      [VerificationFailureType.EXTRACTION_FAILURE]: 'We had trouble reading your document. Our team will review your submission.',
      [VerificationFailureType.NO_COMPARABLE_DATA]: 'We could not extract enough information to verify your documents. Our team will review your submission.',
      [VerificationFailureType.PARTIAL_DATA_EXTRACTED]: 'We could only extract partial information from your documents. Our team will review your submission.'
    };
    
    return messages[type] || 'An error occurred during verification. Please try again or contact support.';
  }
  
  /**
   * Determine if error type should allow reupload
   */
  static shouldAllowReupload(type: VerificationFailureType): boolean {
    const reuploadAllowed = [
      VerificationFailureType.QUALITY_ISSUE,
      VerificationFailureType.IMAGE_TOO_BLURRY,
      VerificationFailureType.IMAGE_TOO_DARK,
      VerificationFailureType.DOCUMENT_INCOMPLETE,
      VerificationFailureType.OCR_EXTRACTION_FAILED,
      VerificationFailureType.PDF417_EXTRACTION_FAILED
    ];
    
    return reuploadAllowed.includes(type);
  }
  
  /**
   * Determine if error type should route to manual review
   */
  static shouldRouteToManualReview(type: VerificationFailureType): boolean {
    const manualReviewTypes = [
      VerificationFailureType.TECHNICAL_FAILURE,
      VerificationFailureType.FACE_RECOGNITION_TECHNICAL_ERROR,
      VerificationFailureType.EXTRACTION_FAILURE,
      VerificationFailureType.NO_COMPARABLE_DATA,
      VerificationFailureType.PARTIAL_DATA_EXTRACTED,
      VerificationFailureType.IMAGE_PROCESSING_FAILED
    ];
    
    return manualReviewTypes.includes(type);
  }
  
  /**
   * Determine if error type is a fraud alert
   */
  static isFraudAlert(type: VerificationFailureType): boolean {
    const fraudTypes = [
      VerificationFailureType.FRAUD_DETECTED,
      VerificationFailureType.PHOTO_MISMATCH_FRAUD,
      VerificationFailureType.DATA_INCONSISTENCY_FRAUD,
      VerificationFailureType.DOCUMENT_TAMPERING
    ];
    
    return fraudTypes.includes(type);
  }
  
  /**
   * Determine final verification status based on error type
   */
  static getStatusForError(type: VerificationFailureType): VerificationStatus {
    if (this.shouldRouteToManualReview(type)) {
      return VerificationStatus.MANUAL_REVIEW;
    }
    
    return VerificationStatus.FAILED;
  }
}