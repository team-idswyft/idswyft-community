export interface User {
  id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  status?: string;
  metadata?: any;
  created_at: Date;
  updated_at?: Date;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  developer_id: string;
  status: VerificationStatus;
  document_id?: string;
  selfie_id?: string;
  face_match_score?: number;
  liveness_score?: number;
  confidence_score?: number;
  live_capture_completed?: boolean;
  manual_review_reason?: string;
  failure_reason?: string;
  external_verification_id?: string;
  // Enhanced verification fields
  back_of_id_uploaded?: boolean;
  cross_validation_score?: number;
  photo_consistency_score?: number;
  enhanced_verification_completed?: boolean;
  // Address verification fields
  address_verification_status?: 'pass' | 'review' | 'reject';
  address_data?: Record<string, any>;
  address_match_score?: number;
  created_at: Date;
  updated_at: Date;
}

export type VerificationStatus = 'pending' | 'processing' | 'verified' | 'failed' | 'manual_review';

export type VerificationSource = 'api' | 'vaas' | 'demo';

export interface Document {
  id: string;
  verification_request_id: string;
  file_path: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  document_type: DocumentType;
  issuing_country?: string; // ISO 3166-1 alpha-2
  ocr_data?: OCRData;
  ocr_extracted?: boolean;
  quality_score?: number;
  quality_analysis?: any;
  authenticity_score?: number;
  // Back-of-ID fields
  is_back_of_id?: boolean;
  barcode_data?: any;
  cross_validation_results?: any;
  back_of_id_document_id?: string;
  created_at: Date;
}

export type DocumentType = 'passport' | 'drivers_license' | 'national_id' | 'other'
  | 'utility_bill' | 'bank_statement' | 'tax_document';

export interface Selfie {
  id: string;
  verification_request_id: string;
  file_path: string | null;
  file_name: string;
  file_size: number;
  liveness_score?: number;
  face_detected: boolean;
  created_at: Date;
}

export interface OCRData {
  name?: string;
  date_of_birth?: string;
  document_number?: string;
  expiration_date?: string;
  issuing_authority?: string;
  issuing_country?: string; // ISO 3166-1 alpha-2
  nationality?: string;
  address?: string;
  raw_text?: string;
  confidence_scores?: Record<string, number>;
  // Additional fields for comprehensive document processing
  id_number?: string;
  expiry_date?: string;
  sex?: string;
  height?: string;
  eye_color?: string;
}

export interface APIKey {
  id: string;
  developer_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  is_sandbox: boolean;
  is_active: boolean;
  last_used_at?: Date;
  created_at: Date;
  expires_at?: Date;
}

export interface Developer {
  id: string;
  email: string;
  name: string;
  company?: string;
  webhook_url?: string;
  sandbox_webhook_url?: string;
  is_verified: boolean;
  github_id?: number;
  avatar_url?: string;
  created_at: Date;
}

export interface Webhook {
  id: string;
  developer_id: string;
  url: string;
  is_sandbox: boolean;
  secret_token?: string;
  secret_key?: string;
  events?: string[];
  is_active: boolean;
  created_at: Date;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  verification_request_id: string;
  payload: WebhookPayload;
  status: 'pending' | 'delivered' | 'failed';
  response_status?: number;
  response_body?: string;
  attempts: number;
  next_retry_at?: Date;
  created_at: Date;
  delivered_at?: Date;
}

export interface WebhookPayload {
  event?: string;
  user_id: string;
  verification_id: string;
  status: VerificationStatus;
  timestamp: string;
  data?: {
    ocr_data?: OCRData;
    face_match_score?: number;
    manual_review_reason?: string;
    failure_reason?: string;
  };
}

export interface RateLimitRecord {
  id: string;
  identifier: string;
  identifier_type: 'user' | 'developer' | 'ip';
  request_count: number;
  window_start: Date;
  blocked_until?: Date;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'reviewer';
  created_at: Date;
  updated_at?: Date;
}

// API Request/Response Types
export interface VerifyDocumentRequest {
  user_id: string;
  document_type: DocumentType;
  issuing_country?: string; // ISO 3166-1 alpha-2
  sandbox?: boolean;
}

export interface VerifyDocumentResponse {
  verification_id: string;
  status: VerificationStatus;
  message: string;
  upload_url?: string;
}

export interface VerifySelfieRequest {
  verification_id: string;
  sandbox?: boolean;
}

export interface VerifyStatusResponse {
  verification_id: string;
  user_id: string;
  status: VerificationStatus;
  created_at: string;
  updated_at: string;
  data?: {
    ocr_data?: OCRData;
    face_match_score?: number;
    manual_review_reason?: string;
    failure_reason?: string;
  };
}

export interface CreateAPIKeyRequest {
  name: string;
  is_sandbox?: boolean;
  expires_in_days?: number;
}

export interface CreateAPIKeyResponse {
  api_key: string;
  key_id: string;
  name: string;
  is_sandbox: boolean;
  expires_at?: string;
}

// External API Types
export interface PersonaVerificationResponse {
  id: string;
  status: 'pending' | 'passed' | 'failed' | 'requires_retry';
  decision?: string;
  reference_id?: string;
}

export interface OnfidoVerificationResponse {
  id: string;
  status: 'pending' | 'in_progress' | 'awaiting_approval' | 'complete';
  result?: 'clear' | 'consider';
  reference?: string;
}

// Configuration Types
export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  railwayAllowedOrigins: string[];
  jwtSecret: string;
  apiKeySecret: string;
  serviceToken: string;
  encryptionKey: string;
  database: {
    url: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    storageBucket: string;
    vaasBucket: string;
    demoBucket: string;
  };
  storage: {
    provider: 'supabase' | 'local' | 's3';
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsRegion?: string;
    awsS3Bucket?: string;
  };
  ocr: {
    tesseractPath: string;
  };
  externalApis: {
    persona?: {
      apiKey: string;
      templateId: string;
    };
    onfido?: {
      apiKey: string;
      webhookToken: string;
    };
  };
  rateLimiting: {
    windowMs: number;
    maxRequestsPerUser: number;
    maxRequestsPerDev: number;
  };
  webhooks: {
    retryAttempts: number;
    timeoutMs: number;
  };
  compliance: {
    dataRetentionDays: number;
    gdprCompliance: boolean;
  };
  sandbox: {
    enabled: boolean;
    mockVerification: boolean;
    mockDelayMs: number;
    retentionHours: number;
  };
  providers: {
    ocr: 'tesseract' | 'openai' | 'azure' | 'aws-textract' | 'auto';
    face: 'tensorflow' | 'aws-rekognition' | 'custom';
    liveness: 'heuristic' | 'custom';
    customOcrEndpoint?: string;
    customFaceEndpoint?: string;
  };
  email: {
    resendApiKey: string;
    fromAddress: string;
  };
  github: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

// Error Types
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationError extends APIError {
  field: string;
  value: any;
}

// Middleware Types
export interface AuthenticatedRequest extends Express.Request {
  developer?: Developer;
  apiKey?: APIKey;
  user?: User;
}

declare global {
  namespace Express {
    interface Request {
      developer?: Developer;
      apiKey?: APIKey;
      user?: User;
    }
  }
}