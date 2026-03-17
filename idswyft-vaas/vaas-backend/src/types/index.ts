// VaaS Type Definitions

export interface VaasOrganization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise' | 'custom';
  billing_status: 'active' | 'past_due' | 'cancelled' | 'suspended';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  settings: VaasOrganizationSettings;
  branding: VaasOrganizationBranding;
  contact_email?: string;
  contact_phone?: string;
  support_email?: string;
  created_at: string;
  updated_at: string;
}

export interface VaasOrganizationSettings {
  // Verification settings
  require_liveness?: boolean;
  require_back_of_id?: boolean;
  auto_approve_threshold?: number;
  manual_review_threshold?: number;
  
  // UI settings
  theme?: 'light' | 'dark';
  language?: string;
  timezone?: string;
  
  // Notification settings
  email_notifications?: boolean;
  webhook_notifications?: boolean;
  
  // Security settings
  session_timeout?: number;
  max_verification_attempts?: number;
  ip_restrictions?: string[];
}

export interface VaasOrganizationBranding {
  // Visual branding
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  favicon_url?: string;
  
  // Text branding
  company_name?: string;
  tagline?: string;
  welcome_message?: string;
  success_message?: string;
  
  // Custom domain
  custom_domain?: string;
  ssl_enabled?: boolean;
}

export interface VaasAdmin {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  permissions: VaasAdminPermissions;
  status: 'active' | 'inactive' | 'invited';
  email_verified: boolean;
  email_verified_at?: string;
  last_login_at?: string;
  login_count: number;
  created_at: string;
  updated_at: string;
}

export interface VaasAdminPermissions {
  // Organization management
  manage_organization?: boolean;
  manage_admins?: boolean;
  manage_billing?: boolean;
  
  // User management
  view_users?: boolean;
  manage_users?: boolean;
  export_users?: boolean;
  
  // Verification management
  view_verifications?: boolean;
  review_verifications?: boolean;
  approve_verifications?: boolean;
  
  // Settings
  manage_settings?: boolean;
  manage_webhooks?: boolean;
  manage_integrations?: boolean;
  
  // Analytics
  view_analytics?: boolean;
  export_analytics?: boolean;
}

export interface VaasEndUser {
  id: string;
  organization_id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  metadata: Record<string, any>;
  tags: string[];
  verification_status: 'pending' | 'in_progress' | 'verified' | 'failed' | 'manual_review' | 'expired';
  verification_completed_at?: string;
  consent_given_at?: string;
  consent_version?: string;
  consent_purpose?: string;
  data_deletion_requested_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VaasVerificationSession {
  id: string;
  organization_id: string;
  end_user_id: string;
  idswyft_verification_id: string; // Links to main Idswyft API
  idswyft_user_id: string;
  status: 'pending' | 'document_uploaded' | 'processing' | 'completed' | 'verified' | 'failed' | 'expired' | 'manual_review' | 'terminated';
  results: VaasVerificationResults;
  confidence_score?: number;
  ip_address?: string;
  user_agent?: string;
  session_token?: string;
  expires_at?: string;
  started_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VaasVerificationResults {
  // Core verification results (from main Idswyft API)
  verification_status?: string;
  face_match_score?: number;
  liveness_score?: number;
  cross_validation_score?: number;
  confidence_score?: number;
  
  // Document analysis
  documents?: any[];
  back_of_id?: any;
  
  // Face analysis
  liveness_analysis?: any;
  face_analysis?: any;
  
  // VaaS-specific data
  session_duration_ms?: number;
  steps_completed?: string[];
  client_metadata?: Record<string, any>;
  
  // Manual review data
  manual_review_reason?: string;
  reviewer_id?: string;
  reviewed_at?: string;
  review_notes?: string;
}

export interface VaasUsageRecord {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  verification_count: number;
  api_calls: number;
  storage_used_mb: number;
  base_amount_cents: number;
  usage_amount_cents: number;
  total_amount_cents: number;
  billing_status: 'pending' | 'billed' | 'paid' | 'failed';
  stripe_invoice_id?: string;
  created_at: string;
  updated_at: string;
}

export interface VaasWebhook {
  id: string;
  organization_id: string;
  url: string;
  events: string[];
  secret_key: string;
  enabled: boolean;
  last_success_at?: string;
  last_failure_at?: string;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface VaasWebhookDelivery {
  id: string;
  webhook_id: string;
  organization_id: string;
  event_type: string;
  event_data: Record<string, any>;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  http_status_code?: number;
  response_body?: string;
  error_message?: string;
  attempts: number;
  next_retry_at?: string;
  max_retries: number;
  created_at: string;
  delivered_at?: string;
}

export interface VaasApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_hour: number;
  enabled: boolean;
  last_used_at?: string;
  created_at: string;
  expires_at?: string;
}

// API Request/Response types
export interface VaasCreateOrganizationRequest {
  name: string;
  slug?: string;
  contact_email: string;
  subscription_tier?: 'starter' | 'professional' | 'enterprise';
  admin_email: string;
  admin_password: string;
  admin_first_name?: string;
  admin_last_name?: string;
}

export interface VaasLoginRequest {
  email: string;
  password: string;
  organization_slug?: string;
}

export interface VaasLoginResponse {
  token: string;
  refresh_token: string;
  admin: Omit<VaasAdmin, 'password_hash'>;
  organization: VaasOrganization;
  expires_at: string;
}

export interface VaasEnterpriseSignupRequest {
  // Personal information
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  
  // Company information
  company: string;
  jobTitle: string;
  
  // Business context
  estimatedVolume: string;
  useCase: string;
}

export interface VaasCreateEndUserRequest {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface VaasSendVerificationInvitationRequest {
  custom_message?: string;
  expiration_days?: number;
}

export interface VaasSendVerificationInvitationResponse extends VaasEndUser {
  verification_url: string;
  session_token: string;
  expires_at: string;
  invitation_sent: boolean;
  invitation_sent_at: string;
}

export interface VaasStartVerificationRequest {
  end_user: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    external_id?: string;
    metadata?: Record<string, any>;
  };
  issuing_country?: string; // ISO 3166-1 alpha-2
  settings?: {
    require_liveness?: boolean;
    require_back_of_id?: boolean;
    callback_url?: string;
    success_redirect_url?: string;
    failure_redirect_url?: string;
  };
}

export interface VaasStartVerificationResponse {
  session_id: string;
  verification_url: string;
  end_user: VaasEndUser;
  expires_at: string;
  session_token: string;
}

// Webhook event types
export interface VaasWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: any;
    previous_attributes?: any;
  };
  organization_id: string;
  api_version: string;
}

// Common response wrapper
export interface VaasApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    total_pages?: number;
    has_more?: boolean;
  };
}

export type AssetType = 'logo' | 'favicon' | 'email-banner' | 'portal-background';

export const ASSET_TYPES: AssetType[] = ['logo', 'favicon', 'email-banner', 'portal-background'];

export const ASSET_TYPE_TO_BRANDING_KEY: Record<AssetType, string> = {
  'logo': 'logo_url',
  'favicon': 'favicon_url',
  'email-banner': 'email_banner_url',
  'portal-background': 'portal_background_url',
};

export interface AssetUploadResult {
  url: string;
  asset_type: AssetType;
  updated_at: string;
}

export interface PlatformBranding {
  logo_url: string | null;
  favicon_url: string | null;
  email_banner_url: string | null;
  portal_background_url: string | null;
  updated_at: string;
}