// Clean verification API service connecting to new v2 backend endpoints
// Uses the NewVerificationEngine for proper state machine flow
import { VerificationSession } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface StartVerificationResponse {
  verification_id: string;
  status: string;
  user_id: string;
  next_steps: string[];
  created_at: string;
}

interface VerificationResults {
  verification_id: string;
  status: 'pending' | 'front_document_uploaded' | 'front_document_processing' | 'front_document_processed' |
          'back_document_uploaded' | 'back_document_processing' | 'back_document_processed' |
          'cross_validation_processing' | 'cross_validation_completed' |
          'live_capture_ready' | 'live_capture_uploaded' | 'live_capture_processing' | 'live_capture_completed' |
          'verified' | 'failed' | 'manual_review';
  current_step: number;
  total_steps: number;

  // Document states
  front_document_uploaded: boolean;
  back_document_uploaded: boolean;
  live_capture_uploaded: boolean;

  // Processing results
  ocr_data?: any;
  barcode_data?: any;
  cross_validation_results?: any;
  face_match_results?: any;
  liveness_results?: any;

  // Algorithm decisions
  barcode_extraction_failed: boolean;
  documents_match: boolean;
  face_match_passed: boolean;
  liveness_passed: boolean;

  // Final result
  final_result?: 'verified' | 'failed' | 'manual_review';
  failure_reason?: string;
  manual_review_reason?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

class NewVerificationAPI {
  private getApiKey(session: VerificationSession): string {
    // Get API key from organization settings
    const isTestMode = import.meta.env.VITE_SANDBOX_MODE === 'true';

    const sandboxKey = session.organization?.settings?.default_sandbox_main_api_key;
    const productionKey = session.organization?.settings?.default_main_api_key;

    const apiKey = (isTestMode && sandboxKey) ? sandboxKey :
                   productionKey ||
                   sandboxKey ||
                   session.organization?.settings?.idswyft_api_key ||
                   session.organization?.settings?.api_key ||
                   import.meta.env.VITE_IDSWYFT_API_KEY ||
                   '';

    if (!apiKey) {
      console.warn('❌ No API key found for verification');
      throw new Error('No API key configured. Please contact your organization administrator.');
    }

    console.log('✅ Using API key:', apiKey.substring(0, 8) + '...');
    return apiKey;
  }

  private shouldUseSandbox(): boolean {
    return import.meta.env.VITE_SANDBOX_MODE === 'true' ||
           window.location.hostname === 'localhost' ||
           window.location.hostname.includes('preview');
  }

  async startVerification(session: VerificationSession, issuingCountry?: string): Promise<string> {
    console.log('🚀 Starting verification session...');

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    const requestBody = {
      user_id: session.id,
      source: 'vaas' as const,
      ...(issuingCountry && { issuing_country: issuingCountry }),
      ...(useSandbox && { sandbox: true })
    };

    console.log('📡 Request:', { url: `${API_BASE_URL}/api/v2/verify/initialize`, body: requestBody, sandbox: useSandbox });

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/verify/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error?.message || errorData?.error || errorData?.message || response.statusText;
        console.error('❌ Start verification failed:', errorMessage);
        throw new Error(`Failed to start verification: ${errorMessage}`);
      }

      const data: StartVerificationResponse = await response.json();
      console.log('✅ Verification started:', data);

      return data.verification_id;
    } catch (error) {
      console.error('❌ Start verification error:', error);
      throw error;
    }
  }

  async uploadFrontDocument(session: VerificationSession, verificationId: string, file: File, documentType: string, issuingCountry?: string): Promise<void> {
    console.log('📄 Uploading front document...', { verificationId, documentType, issuingCountry, fileSize: file.size });

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    const formData = new FormData();
    formData.append('document', file);
    formData.append('document_type', documentType);
    if (issuingCountry) {
      formData.append('issuing_country', issuingCountry);
    }
    if (useSandbox) {
      formData.append('sandbox', 'true');
    }

    const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/front-document`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('❌ Front document upload failed:', errorData);
      throw new Error(errorData?.error || errorData?.message || 'Failed to upload front document');
    }

    const result = await response.json();
    console.log('✅ Front document uploaded:', result);
  }

  async uploadBackDocument(session: VerificationSession, verificationId: string, file: File, documentType: string, issuingCountry?: string): Promise<void> {
    console.log('📄 Uploading back document...', { verificationId, documentType, issuingCountry, fileSize: file.size });

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    const formData = new FormData();
    formData.append('document', file);
    if (issuingCountry) {
      formData.append('issuing_country', issuingCountry);
    }
    if (useSandbox) {
      formData.append('sandbox', 'true');
    }

    const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/back-document`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('❌ Back document upload failed:', errorData);
      throw new Error(errorData?.error || errorData?.message || 'Failed to upload back document');
    }

    const result = await response.json();
    console.log('✅ Back document uploaded:', result);
  }

  async captureLiveSelfie(session: VerificationSession, verificationId: string, imageData: string, livenessMetadata?: unknown): Promise<void> {
    console.log('📸 Capturing live selfie...', { verificationId, dataSize: imageData.length });

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    // Convert base64 image to blob for FormData
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('selfie', file);
    if (useSandbox) {
      formData.append('sandbox', 'true');
    }
    if (livenessMetadata) {
      formData.append('liveness_metadata', JSON.stringify(livenessMetadata));
    }

    const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/live-capture`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('❌ Live capture failed:', errorData);
      throw new Error(errorData?.error || errorData?.message || 'Live capture failed');
    }

    const result = await response.json();
    console.log('✅ Live capture completed:', result);
  }

  async performCrossValidation(session: VerificationSession, verificationId: string): Promise<void> {
    console.log('🔍 Performing cross-validation...', { verificationId });

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    const requestBody = {
      ...(useSandbox && { sandbox: true })
    };

    const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/cross-validation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('❌ Cross-validation failed:', errorData);
      throw new Error(errorData?.error || errorData?.message || 'Cross-validation failed');
    }

    const result = await response.json();
    console.log('✅ Cross-validation completed:', result);
  }

  async finalizeVerification(session: VerificationSession, verificationId: string): Promise<void> {
    console.log('⚖️ Finalizing verification...', { verificationId });

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    const requestBody = {
      ...(useSandbox && { sandbox: true })
    };

    const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('❌ Finalization failed:', errorData);
      throw new Error(errorData?.error || errorData?.message || 'Verification finalization failed');
    }

    const result = await response.json();
    console.log('✅ Verification finalized:', result);
  }

  async getVerificationResults(session: VerificationSession, verificationId: string): Promise<VerificationResults> {
    console.log('🔍 Getting verification results...', { verificationId });

    const apiKey = this.getApiKey(session);
    const useSandbox = this.shouldUseSandbox();

    const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/status`);
    if (useSandbox) {
      url.searchParams.append('sandbox', 'true');
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('❌ Get results failed:', errorData);
      throw new Error(errorData?.error || errorData?.message || 'Failed to get verification results');
    }

    const results: VerificationResults = await response.json();
    console.log('📊 Verification results:', results);

    return results;
  }
}

export default new NewVerificationAPI();