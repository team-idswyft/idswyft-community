import { AxiosInstance, AxiosResponse } from 'axios';
import { createApiClient, type ApiError } from '../lib/apiClient';
import {
  VerificationSession,
  ApiResponse,
  DocumentUploadResponse,
  VerificationStatusResponse
} from '../types';

// Re-export ApiError so consumers can use it without importing from lib directly
export type { ApiError };

const API_ORIGIN = import.meta.env.VITE_VAAS_API_URL || import.meta.env.VITE_API_URL;
const BASE_URL = API_ORIGIN
  ? `${API_ORIGIN}/api`
  : 'http://localhost:3002/api';

class CustomerPortalAPI {
  private client: AxiosInstance;

  constructor() {
    this.client = createApiClient(BASE_URL);

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[API] Request error:', error);
        return Promise.reject(error);
      }
    );
  }

  // Get verification session with organization branding
  async getVerificationSession(sessionToken: string): Promise<VerificationSession> {
    const response: AxiosResponse<ApiResponse<VerificationSession>> = await this.client.get(
      `/verifications/session/${sessionToken}`
    );

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to load verification session');
    }

    return response.data.data!;
  }

  // Upload document for verification
  async uploadDocument(
    sessionToken: string,
    file: File,
    type: 'front' | 'back' | 'selfie',
    onUploadProgress?: (progress: number) => void
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('type', type);

    const response: AxiosResponse<DocumentUploadResponse> = await this.client.post(
      `/public/sessions/${sessionToken}/documents`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onUploadProgress) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onUploadProgress(progress);
          }
        },
      }
    );

    return response.data;
  }

  // Submit verification for processing
  async submitVerification(sessionToken: string, idempotencyKey: string): Promise<void> {
    await this.client.post(
      `/public/sessions/${sessionToken}/submit`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }

  // Get verification status
  async getVerificationStatus(sessionToken: string): Promise<VerificationStatusResponse> {
    const response: AxiosResponse<VerificationStatusResponse> = await this.client.get(
      `/public/sessions/${sessionToken}/status`
    );

    return response.data;
  }

  // Perform liveness check
  async performLivenessCheck(sessionToken: string, livenessData: any): Promise<void> {
    await this.client.post(`/public/sessions/${sessionToken}/liveness`, livenessData);
  }

  // Report verification result back to VaaS backend so the admin dashboard
  // shows real status + scores instead of stuck "processing".
  async reportResult(sessionToken: string, results: any): Promise<void> {
    await this.client.post(`/public/sessions/${sessionToken}/result`, {
      final_result: results.final_result,
      confidence_score: results.face_match_results?.similarity_score ?? results.confidence_score,
      face_match_results: results.face_match_results,
      liveness_results: results.liveness_results,
      ocr_data: results.ocr_data,
      cross_validation_results: results.cross_validation_results,
      failure_reason: results.failure_reason,
      manual_review_reason: results.manual_review_reason,
      aml_screening: results.aml_screening,
    });
  }

  // Restart a failed verification session (allows user to retry)
  async restartSession(sessionToken: string): Promise<void> {
    const response = await this.client.post(`/verifications/session/${sessionToken}/restart`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to restart session');
    }
  }

  // Terminate verification session (make link inactive)
  async terminateVerificationSession(sessionToken: string): Promise<void> {
    await this.client.post(`/verifications/session/${sessionToken}/terminate`);
  }
}

// Create and export a singleton instance
export const customerPortalAPI = new CustomerPortalAPI();
export default customerPortalAPI;
