import { VerificationSession } from '../types';
import newVerificationApi from './newVerificationApi';
import customerPortalAPI from './api';

interface VerificationResults {
  verification_id: string;
  status:
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
  current_step: number;
  total_steps: number;
  front_document_uploaded: boolean;
  back_document_uploaded: boolean;
  live_capture_uploaded: boolean;
  ocr_data?: any;
  barcode_data?: any;
  cross_validation_results?: any;
  face_match_results?: any;
  liveness_results?: any;
  barcode_extraction_failed: boolean;
  documents_match: boolean;
  face_match_passed: boolean;
  liveness_passed: boolean;
  final_result?: 'verified' | 'failed' | 'manual_review' | null;
  rejection_reason?: string;
  rejection_detail?: string;
  failure_reason?: string;
  manual_review_reason?: string;
  created_at: string;
  updated_at: string;
}

class VerificationAPI {
  private sessionToken: string | null = null;

  setSessionToken(token: string) {
    this.sessionToken = token;
  }

  async startVerification(session: VerificationSession, issuingCountry?: string): Promise<string> {
    return newVerificationApi.startVerification(session, issuingCountry);
  }

  async uploadDocument(
    session: VerificationSession,
    verificationId: string,
    file: File,
    documentType: string,
    onProgress?: (progress: number) => void,
    issuingCountry?: string,
  ): Promise<void> {
    await newVerificationApi.uploadFrontDocument(session, verificationId, file, documentType, issuingCountry);
    // Fire-and-forget: sync document to VaaS storage for admin preview
    if (this.sessionToken) {
      customerPortalAPI.uploadDocument(this.sessionToken, file, 'front').catch(() => {});
    }
    const results = await this.getResults(session, verificationId);
    if (results.status === 'failed' || results.status === 'manual_review') {
      throw new Error(results.failure_reason || results.manual_review_reason || results.rejection_detail || 'Front document verification failed');
    }
    onProgress?.(100);
  }

  async uploadBackOfId(
    session: VerificationSession,
    verificationId: string,
    file: File,
    documentType: string,
    onProgress?: (progress: number) => void,
    issuingCountry?: string,
  ): Promise<void> {
    await newVerificationApi.uploadBackDocument(session, verificationId, file, documentType, issuingCountry);
    // Fire-and-forget: sync document to VaaS storage for admin preview
    if (this.sessionToken) {
      customerPortalAPI.uploadDocument(this.sessionToken, file, 'back').catch(() => {});
    }
    const results = await this.getResults(session, verificationId);
    if (results.status === 'failed' || results.status === 'manual_review') {
      throw new Error(results.failure_reason || results.manual_review_reason || results.rejection_detail || 'Back document verification failed');
    }
    onProgress?.(100);
  }

  async captureSelfie(
    session: VerificationSession,
    verificationId: string,
    file: File,
    onProgress?: (progress: number) => void,
    livenessMetadata?: unknown,
  ): Promise<void> {
    // Fire-and-forget: sync selfie to VaaS storage for admin preview
    if (this.sessionToken) {
      customerPortalAPI.uploadDocument(this.sessionToken, file, 'selfie').catch(() => {});
    }
    const imageData = await this.fileToDataUrl(file);
    await newVerificationApi.captureLiveSelfie(session, verificationId, imageData, livenessMetadata);
    const results = await this.getResults(session, verificationId);
    if (results.status === 'failed' || results.status === 'manual_review') {
      throw new Error(results.failure_reason || results.manual_review_reason || results.rejection_detail || 'Live capture verification failed');
    }
    onProgress?.(100);
  }

  async captureLiveSelfie(
    session: VerificationSession,
    verificationId: string,
    imageData: string,
    onProgress?: (progress: number) => void,
    livenessMetadata?: unknown,
  ): Promise<void> {
    // Fire-and-forget: sync selfie to VaaS storage for admin preview
    if (this.sessionToken) {
      fetch(imageData)
        .then(r => r.blob())
        .then(blob => {
          const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
          return customerPortalAPI.uploadDocument(this.sessionToken!, file, 'selfie');
        })
        .catch(() => {});
    }
    await newVerificationApi.captureLiveSelfie(session, verificationId, imageData, livenessMetadata);
    const results = await this.getResults(session, verificationId);
    if (results.status === 'failed' || results.status === 'manual_review') {
      throw new Error(results.failure_reason || results.manual_review_reason || results.rejection_detail || 'Live capture verification failed');
    }
    onProgress?.(100);
  }

  async getResults(session: VerificationSession, verificationId: string): Promise<VerificationResults> {
    return newVerificationApi.getVerificationResults(session, verificationId) as Promise<VerificationResults>;
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }
}

export default new VerificationAPI();
