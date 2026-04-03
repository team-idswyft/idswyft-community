import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { VerificationEventEmitter } from './events';
import type { WatchOptions } from './events';

// ─── Configuration ──────────────────────────────────────

export interface IdswyftConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  sandbox?: boolean;
}

// ─── Verification Types ─────────────────────────────────

export type DocumentType = 'passport' | 'drivers_license' | 'national_id' | 'other' | 'auto'
  | 'utility_bill' | 'bank_statement' | 'tax_document';

export type VerificationMode = 'full' | 'document_only' | 'identity' | 'age_only';

export type VerificationStatus =
  | 'AWAITING_FRONT'
  | 'FRONT_PROCESSING'
  | 'AWAITING_BACK'
  | 'BACK_PROCESSING'
  | 'CROSS_VALIDATING'
  | 'AWAITING_LIVE'
  | 'LIVE_PROCESSING'
  | 'FACE_MATCHING'
  | 'COMPLETE'
  | 'HARD_REJECTED';

export interface OCRData {
  full_name?: string;
  name?: string;
  date_of_birth?: string;
  id_number?: string;
  document_number?: string;
  expiry_date?: string;
  expiration_date?: string;
  nationality?: string;
  address?: string;
  issuing_authority?: string;
  raw_text?: string;
  confidence_scores?: Record<string, number>;
}

export interface CrossValidationResults {
  verdict: 'PASS' | 'REVIEW';
  has_critical_failure: boolean;
  score: number;
  failures: string[];
}

export interface FaceMatchResults {
  passed: boolean;
  score: number;
  distance: number;
}

export interface LivenessResults {
  liveness_passed: boolean;
  liveness_score: number;
}

export interface InitializeResponse {
  success: boolean;
  verification_id: string;
  verification_mode: string;
  status: VerificationStatus;
  current_step: number;
  total_steps: number;
  message: string;
}

export interface VerificationResult {
  success: boolean;
  verification_id: string;
  status: VerificationStatus;
  current_step: number;
  total_steps?: number;
  message?: string;
  // Front document fields
  document_id?: string;
  document_path?: string;
  ocr_data?: OCRData | null;
  // Back document fields
  barcode_data?: Record<string, any> | null;
  barcode_extraction_failed?: boolean;
  documents_match?: boolean | null;
  cross_validation_results?: CrossValidationResults | null;
  // Live capture fields
  selfie_id?: string;
  selfie_path?: string;
  face_match_results?: FaceMatchResults | null;
  liveness_results?: LivenessResults | null;
  // Final decision
  final_result?: 'verified' | 'manual_review' | 'failed' | null;
  // Rejection/failure info
  rejection_reason?: string | null;
  rejection_detail?: string | null;
  failure_reason?: string | null;
  manual_review_reason?: string | null;
  // Status endpoint extras
  front_document_uploaded?: boolean;
  back_document_uploaded?: boolean;
  live_capture_uploaded?: boolean;
  face_match_passed?: boolean | null;
  liveness_passed?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Batch Verification Types ───────────────────────────

export interface BatchItemInput {
  user_id: string;
  document_type?: DocumentType;
  front_document_url?: string;
  back_document_url?: string;
  selfie_url?: string;
  metadata?: Record<string, any>;
}

export interface BatchJobResponse {
  success: boolean;
  batch_id: string;
  status: string;
  total_items: number;
  message: string;
}

export interface BatchStatusResponse {
  batch_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
  total_items: number;
  processed_items: number;
  succeeded_items: number;
  failed_items: number;
  progress_percentage: number;
  created_at: string;
  completed_at: string | null;
}

export interface BatchResultItem {
  item_id: string;
  user_id: string | null;
  status: string;
  verification_id: string | null;
  error: string | null;
}

export interface BatchResultsResponse {
  results: BatchResultItem[];
}

export interface BatchListResponse {
  jobs: BatchStatusResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ─── Address Verification Types ─────────────────────────

export type AddressDocumentType = 'utility_bill' | 'bank_statement' | 'tax_document';

export interface AddressVerificationResult {
  status: 'pass' | 'review' | 'reject';
  score: number;
  name_match_score: number;
  address: string | null;
  document_type: AddressDocumentType | null;
  document_fresh: boolean | null;
  reasons: string[];
}

export interface AddressVerificationResponse {
  success: boolean;
  verification_id: string;
  address_verification: AddressVerificationResult;
}

export interface AddressStatusResponse {
  verification_id: string;
  address_verification: AddressVerificationResult | null;
  message?: string;
}

// ─── Monitoring Types ────────────────────────────────────

export interface ReverificationSchedule {
  id: string;
  user_id: string;
  interval_days: number;
  next_verification_at: string;
  last_verification_at: string | null;
  status: 'active' | 'paused' | 'cancelled';
  created_at: string;
}

export interface CreateScheduleRequest {
  user_id: string;
  interval_days: number;
  verification_request_id?: string;
}

export interface ScheduleListResponse {
  schedules: ReverificationSchedule[];
  total: number;
  page: number;
  limit: number;
}

export interface ExpiryAlert {
  id: string;
  verification_request_id: string;
  user_id: string | null;
  expiry_date: string;
  alert_type: '90_day' | '60_day' | '30_day' | 'expired';
  webhook_sent: boolean;
  created_at: string;
}

export interface ExpiryAlertListResponse {
  alerts: ExpiryAlert[];
  total: number;
  page: number;
  limit: number;
}

// ─── Developer & Webhook Types ──────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  environment: 'sandbox' | 'production';
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
  monthly_requests?: number;
}

export interface CreateApiKeyRequest {
  name: string;
  environment: 'sandbox' | 'production';
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  last_delivery_at?: string;
  secret?: string;
}

export interface CreateWebhookRequest {
  url: string;
  events?: string[];
  secret?: string;
}

// ─── Error Handling ─────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  details?: any;
  code?: string;
}

export class IdswyftError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message);
    this.name = 'IdswyftError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ─── SDK Client ─────────────────────────────────────────

export class IdswyftSDK {
  private client: AxiosInstance;
  private config: Required<IdswyftConfig>;

  constructor(config: IdswyftConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.idswyft.app',
      timeout: config.timeout || 30000,
      sandbox: config.sandbox || false,
    };

    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'X-API-Key': this.config.apiKey,
        'User-Agent': '@idswyft/sdk/4.0.0',
        'X-SDK-Version': '4.0.0',
        'X-SDK-Language': 'javascript',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const apiError = error.response.data as ApiError;
          throw new IdswyftError(
            apiError.message || 'API request failed',
            error.response.status,
            apiError.code,
            apiError.details
          );
        } else if (error.request) {
          throw new IdswyftError('Network error - no response received', 0);
        } else {
          throw new IdswyftError(`Request setup error: ${error.message}`, 0);
        }
      }
    );
  }

  // ─── Verification Flow (v2 API) ────────────────────────

  /**
   * Step 1: Initialize a new verification session.
   * Returns a verification_id used in all subsequent steps.
   *
   * @param request.verification_mode - Flow preset: 'full' (default), 'document_only', 'identity', or 'age_only'
   * @param request.age_threshold - Minimum age (1-99) for age_only mode (default: 18)
   */
  async startVerification(request: {
    user_id: string;
    document_type?: DocumentType;
    sandbox?: boolean;
    verification_mode?: VerificationMode;
    age_threshold?: number;
  }): Promise<InitializeResponse> {
    const response = await this.client.post('/api/v2/verify/initialize', request);
    return response.data;
  }

  /**
   * Step 2: Upload the front of the ID document.
   * Triggers OCR extraction and Gate 1 (front quality check).
   */
  async uploadFrontDocument(
    verificationId: string,
    documentFile: File | Buffer,
    documentType: DocumentType = 'auto'
  ): Promise<VerificationResult> {
    const formData = new FormData();
    formData.append('document', documentFile);
    formData.append('document_type', documentType);

    const response = await this.client.post(
      `/api/v2/verify/${verificationId}/front-document`,
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    return response.data;
  }

  /**
   * Step 3: Upload the back of the ID document.
   * Triggers barcode extraction, Gate 2 (back quality), and Gate 3 (cross-validation).
   */
  async uploadBackDocument(
    verificationId: string,
    documentFile: File | Buffer,
    documentType: DocumentType = 'auto'
  ): Promise<VerificationResult> {
    const formData = new FormData();
    formData.append('document', documentFile);
    formData.append('document_type', documentType);

    const response = await this.client.post(
      `/api/v2/verify/${verificationId}/back-document`,
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    return response.data;
  }

  /**
   * Step 3.5 (optional): Retrieve cross-validation results.
   * Cross-validation is auto-triggered after back document upload.
   * Use this to query the cached result separately.
   */
  async getCrossValidation(verificationId: string): Promise<VerificationResult> {
    const response = await this.client.post(
      `/api/v2/verify/${verificationId}/cross-validation`
    );
    return response.data;
  }

  /**
   * Step 4: Upload a selfie for liveness detection and face matching.
   * Triggers Gate 4 (liveness) and Gate 5 (face match), then auto-finalizes.
   */
  async uploadSelfie(
    verificationId: string,
    selfieFile: File | Buffer
  ): Promise<VerificationResult> {
    const formData = new FormData();
    formData.append('selfie', selfieFile);

    const response = await this.client.post(
      `/api/v2/verify/${verificationId}/live-capture`,
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    return response.data;
  }

  /**
   * Get the full status and results of a verification session.
   * Can be called at any point to check progress.
   */
  async getVerificationStatus(verificationId: string): Promise<VerificationResult> {
    const response = await this.client.get(
      `/api/v2/verify/${verificationId}/status`
    );
    return response.data;
  }

  // ─── Developer Management ──────────────────────────────

  /**
   * Register as a new developer
   */
  async registerDeveloper(email: string, name: string): Promise<{ developer_id: string; message: string }> {
    const response = await this.client.post('/api/developer/register', { email, name });
    return response.data;
  }

  /**
   * Create a new API key
   */
  async createApiKey(request: CreateApiKeyRequest): Promise<{ api_key: string; key_id: string }> {
    const response = await this.client.post('/api/developer/api-key', request);
    return response.data;
  }

  /**
   * List all API keys
   */
  async listApiKeys(): Promise<{ api_keys: ApiKey[] }> {
    const response = await this.client.get('/api/developer/api-keys');
    return response.data;
  }

  /**
   * Revoke/delete an API key
   */
  async revokeApiKey(keyId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/api/developer/api-key/${keyId}`);
    return response.data;
  }

  /**
   * Get API activity logs
   */
  async getApiActivity(options?: {
    limit?: number;
    offset?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    activities: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.start_date) params.append('start_date', options.start_date);
    if (options?.end_date) params.append('end_date', options.end_date);

    const response = await this.client.get(`/api/developer/activity?${params.toString()}`);
    return response.data;
  }

  /**
   * Get developer usage statistics
   */
  async getUsageStats(): Promise<{
    period: string;
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    pending_requests: number;
    manual_review_requests: number;
    success_rate: string;
    monthly_limit: number;
    monthly_usage: number;
    remaining_quota: number;
    quota_reset_date: string;
  }> {
    const response = await this.client.get('/api/developer/stats');
    return response.data;
  }

  // ─── Webhook Management ────────────────────────────────

  /**
   * Register a webhook URL
   */
  async registerWebhook(request: CreateWebhookRequest): Promise<{ webhook: Webhook }> {
    const response = await this.client.post('/api/webhooks/register', request);
    return response.data;
  }

  /**
   * List all webhooks
   */
  async listWebhooks(): Promise<{ webhooks: Webhook[] }> {
    const response = await this.client.get('/api/webhooks');
    return response.data;
  }

  /**
   * Update a webhook
   */
  async updateWebhook(webhookId: string, request: Partial<CreateWebhookRequest>): Promise<{ webhook: Webhook }> {
    const response = await this.client.put(`/api/webhooks/${webhookId}`, request);
    return response.data;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/api/webhooks/${webhookId}`);
    return response.data;
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(webhookId: string): Promise<{ success: boolean; delivery_id: string }> {
    const response = await this.client.post(`/api/webhooks/${webhookId}/test`);
    return response.data;
  }

  /**
   * Get webhook delivery history
   */
  async getWebhookDeliveries(webhookId: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<{
    deliveries: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const response = await this.client.get(`/api/webhooks/${webhookId}/deliveries?${params.toString()}`);
    return response.data;
  }

  // ─── Real-Time Status Watching ──────────────────────────

  /**
   * Watch a verification session for real-time status updates.
   * Internally polls getVerificationStatus() at a configurable interval.
   * Auto-stops on terminal states (COMPLETE, HARD_REJECTED).
   *
   * @example
   * ```ts
   * const watcher = sdk.watch(verificationId);
   * watcher.on('verification_complete', (event) => {
   *   console.log('Verified!', event.data.final_result);
   * });
   * watcher.on('verification_failed', (event) => {
   *   console.log('Failed:', event.data.rejection_reason);
   * });
   * // Clean up when done
   * watcher.destroy();
   * ```
   */
  watch(verificationId: string, options?: WatchOptions): VerificationEventEmitter {
    return new VerificationEventEmitter(
      verificationId,
      (id) => this.getVerificationStatus(id),
      {
        interval: options?.interval ?? 2000,
        maxAttempts: options?.maxAttempts ?? 300,
        transport: options?.transport ?? 'polling',
      },
    );
  }

  // ─── Batch Verification ────────────────────────────────

  /**
   * Create a batch verification job for processing multiple users.
   * Items are processed asynchronously with controlled concurrency.
   */
  async createBatch(items: BatchItemInput[]): Promise<BatchJobResponse> {
    const response = await this.client.post('/api/v2/batch/upload', { items });
    return response.data;
  }

  /**
   * Get the status and progress of a batch job.
   */
  async getBatchStatus(batchId: string): Promise<BatchStatusResponse> {
    const response = await this.client.get(`/api/v2/batch/${batchId}/status`);
    return response.data;
  }

  /**
   * Get individual item results for a completed batch job.
   */
  async getBatchResults(batchId: string): Promise<BatchResultsResponse> {
    const response = await this.client.get(`/api/v2/batch/${batchId}/results`);
    return response.data;
  }

  /**
   * Cancel a batch job. Already-completed items are unaffected.
   */
  async cancelBatch(batchId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post(`/api/v2/batch/${batchId}/cancel`);
    return response.data;
  }

  /**
   * List all batch jobs for the current developer.
   */
  async listBatches(options?: { page?: number; limit?: number }): Promise<BatchListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const response = await this.client.get(`/api/v2/batch?${params.toString()}`);
    return response.data;
  }

  // ─── Address Verification ──────────────────────────────

  /**
   * Upload a proof-of-address document for verification.
   * Cross-references the name on the address document against the verified ID.
   */
  async uploadAddressDocument(
    verificationId: string,
    document: Buffer | Blob,
    documentType: AddressDocumentType,
    filename?: string,
  ): Promise<AddressVerificationResponse> {
    const formData = new FormData();
    formData.append('document', document, { filename: filename || 'address-document' });
    formData.append('document_type', documentType);

    const response = await this.client.post(
      `/api/v2/verify/${verificationId}/address-document`,
      formData,
      { headers: formData.getHeaders?.() || {} },
    );
    return response.data;
  }

  /**
   * Get the address verification status for a verification.
   */
  async getAddressStatus(verificationId: string): Promise<AddressStatusResponse> {
    const response = await this.client.get(
      `/api/v2/verify/${verificationId}/address-status`,
    );
    return response.data;
  }

  // ─── Monitoring & Re-verification ─────────────────────

  /**
   * Create a re-verification schedule for a user.
   * Sends webhook notifications when re-verification is due.
   *
   * @param request - Schedule parameters (user_id, interval_days 30-730)
   */
  async createMonitoringSchedule(request: CreateScheduleRequest): Promise<{ success: boolean; schedule: ReverificationSchedule }> {
    const response = await this.client.post('/api/v2/monitoring/schedules', request);
    return response.data;
  }

  /**
   * Get a single re-verification schedule by ID.
   */
  async getMonitoringSchedule(scheduleId: string): Promise<{ schedule: ReverificationSchedule }> {
    const response = await this.client.get(`/api/v2/monitoring/schedules/${scheduleId}`);
    return response.data;
  }

  /**
   * List re-verification schedules for the current developer.
   */
  async listMonitoringSchedules(options?: {
    status?: 'active' | 'paused' | 'cancelled';
    page?: number;
    limit?: number;
  }): Promise<ScheduleListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const response = await this.client.get(`/api/v2/monitoring/schedules?${params.toString()}`);
    return response.data;
  }

  /**
   * Cancel a re-verification schedule.
   */
  async cancelMonitoringSchedule(scheduleId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/api/v2/monitoring/schedules/${scheduleId}`);
    return response.data;
  }

  /**
   * Get documents approaching expiry for the current developer.
   *
   * @param options - Filter by days_ahead (default 90), pagination
   */
  async getExpiringDocuments(options?: {
    days_ahead?: number;
    page?: number;
    limit?: number;
  }): Promise<ExpiryAlertListResponse> {
    const params = new URLSearchParams();
    if (options?.days_ahead) params.append('days_ahead', options.days_ahead.toString());
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const response = await this.client.get(`/api/v2/monitoring/expiring-documents?${params.toString()}`);
    return response.data;
  }

  // ─── Utilities ─────────────────────────────────────────

  /**
   * Verify webhook signature (for webhook endpoint security)
   */
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(providedSignature, 'hex');

    // Guard: timingSafeEqual throws RangeError on length mismatch
    if (expectedBuf.length !== providedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await this.client.get('/api/health');
      return response.data;
    } catch (error) {
      if (error instanceof IdswyftError && error.statusCode === 404) {
        return { status: 'ok', timestamp: new Date().toISOString() };
      }
      throw error;
    }
  }
}

// Export default instance creator
export default function createIdswyftSDK(config: IdswyftConfig): IdswyftSDK {
  return new IdswyftSDK(config);
}

// Export alias for the main SDK class
export { IdswyftSDK as Idswyft };

// Re-export events and embed modules
export { VerificationEventEmitter } from './events';
export type { VerificationEventType, VerificationEvent, VerificationEventHandler, WatchOptions } from './events';
export { IdswyftEmbed } from './embed';
export type { EmbedOptions, EmbedCallbacks, EmbedResult, EmbedError, EmbedMode, EmbedTheme } from './embed';
