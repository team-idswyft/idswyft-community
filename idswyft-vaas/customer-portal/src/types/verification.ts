// Clean verification types for the new system

export const VerificationStep = {
  WELCOME: 'welcome',
  COUNTRY_SELECTION: 'country_selection',
  DOCUMENT_TYPE_SELECTION: 'document_type_selection',
  FRONT_DOCUMENT_UPLOAD: 'front_document_upload',
  FRONT_DOCUMENT_PROCESSING: 'front_document_processing',
  BACK_DOCUMENT_UPLOAD: 'back_document_upload',
  BACK_DOCUMENT_PROCESSING: 'back_document_processing',
  CROSS_VALIDATION: 'cross_validation',
  LIVE_CAPTURE: 'live_capture',
  LIVE_CAPTURE_PROCESSING: 'live_capture_processing',
  VERIFICATION_COMPLETE: 'verification_complete'
} as const;

export type VerificationStep = typeof VerificationStep[keyof typeof VerificationStep];

export const VerificationStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  VERIFIED: 'verified',
  FAILED: 'failed',
  MANUAL_REVIEW: 'manual_review'
} as const;

export type VerificationStatus = typeof VerificationStatus[keyof typeof VerificationStatus];

export interface VerificationState {
  sessionToken: string;
  verificationId?: string;
  currentStep: VerificationStep;
  status: VerificationStatus;
  issuingCountry?: string;           // ISO alpha-2 country code
  selectedDocumentType?: string;     // e.g. 'drivers_license', 'passport', 'national_id'
  documents: {
    front?: {
      file: File;
      type: string;
      uploaded: boolean;
      processed: boolean;
      ocrData?: any;
    };
    back?: {
      file: File;
      type: string;
      uploaded: boolean;
      processed: boolean;
      barcodeData?: any;
    };
  };
  crossValidation: {
    completed: boolean;
    passed?: boolean;
    score?: number;
    results?: any;
  };
  liveCapture: {
    completed: boolean;
    processed: boolean;
    faceMatchScore?: number;
    livenessScore?: number;
  };
  finalResult?: {
    status: 'verified' | 'failed' | 'manual_review';
    reason?: string;
    completedAt: Date;
    isAuthentic?: boolean;
    authenticityScore?: number;
    tamperFlags?: string[];
  };
  error?: string;
}

export interface VerificationConfig {
  requireBackOfId: boolean;
  enableLiveCapture: boolean;
  documentTypes: string[];
  maxFileSize: number;
  allowedFileTypes: string[];
}