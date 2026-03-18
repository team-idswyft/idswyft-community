// TypeScript declarations for types.js

export interface AdminPermissions {
  manage_organization: boolean;
  manage_admins: boolean;
  manage_billing: boolean;
  view_users: boolean;
  manage_users: boolean;
  export_users: boolean;
  view_verifications: boolean;
  review_verifications: boolean;
  approve_verifications: boolean;
  manage_settings: boolean;
  manage_webhooks: boolean;
  manage_integrations: boolean;
  view_analytics: boolean;
  export_analytics: boolean;
}

export interface Admin {
  id: string;
  organization_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  permissions: AdminPermissions;
  status: 'active' | 'inactive' | 'pending';
  email_verified: boolean;
  email_verified_at?: string;
  last_login_at?: string;
  login_count?: number;
  is_super_admin?: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettings {
  require_liveness: boolean;
  require_back_of_id: boolean;
  auto_approve_threshold: number;
  manual_review_threshold: number;
  theme: 'light' | 'dark';
  language: string;
  email_notifications: boolean;
  webhook_notifications: boolean;
  session_timeout: number;
  max_verification_attempts: number;
}

export interface OrganizationBranding {
  company_name: string;
  logo_url?: string;
  favicon_url?: string;
  email_banner_url?: string;
  portal_background_url?: string;
  primary_color?: string;
  welcome_message: string;
  success_message: string;
  custom_css?: string;
}

export type AssetType = 'logo' | 'favicon' | 'email-banner' | 'portal-background';

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

export interface OrgAssets {
  logo_url: string | null;
  favicon_url: string | null;
  email_banner_url: string | null;
  portal_background_url: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise' | 'custom';
  billing_status: 'active' | 'past_due' | 'cancelled' | 'suspended';
  contact_email: string;
  settings: OrganizationSettings;
  branding: OrganizationBranding;
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T = any> {
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
    has_more?: boolean;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  organization_slug?: string;
}

export interface LoginResponse {
  token: string;
  admin: Admin;
  organization: Organization;
  expires_at: string;
}

export interface EndUser {
  id: string;
  organization_id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  verification_status: 'pending' | 'in_progress' | 'verified' | 'failed' | 'expired' | 'manual_review';
  verification_completed_at?: string;
  verification_url?: string;
  invitation_sent: boolean;
  invitation_sent_at?: string;
  invitation_expires_at?: string;
  metadata: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface VerificationResults {
  verification_status?: string;
  confidence_score?: number;
  face_match_score?: number;
  liveness_score?: number;
  cross_validation_score?: number;
  documents?: any[];
  liveness_analysis?: any;
  face_analysis?: any;
  failure_reasons?: string[];
  manual_review_reason?: string;
  reviewer_id?: string;
  reviewed_at?: string;
  review_notes?: string;
  override_reason?: string;
  override_by?: string;
  override_at?: string;
  override_from_status?: string;
  override_notes?: string | null;
  // OCR / cross-validation data synced from main API
  ocr_data?: Record<string, any>;
  cross_validation_results?: Record<string, any>;
  // AML screening results (opt-in per verification)
  aml_screening?: {
    risk_level: string;
    match_found: boolean;
    match_count: number;
    screened_at: string;
  } | null;
}

export interface VerificationSession {
  id: string;
  organization_id: string;
  end_user_id: string;
  idswyft_verification_id: string;
  idswyft_user_id: string;
  status: 'pending' | 'document_uploaded' | 'processing' | 'completed' | 'verified' | 'failed' | 'expired' | 'manual_review' | 'terminated';
  session_token?: string;
  issuing_country?: string;
  expires_at?: string;
  results: VerificationResults;
  confidence_score?: number;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  vaas_end_users?: EndUser;
}

export interface StartVerificationRequest {
  end_user: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    external_id?: string;
    metadata?: Record<string, any>;
  };
  settings?: {
    require_liveness?: boolean;
    require_back_of_id?: boolean;
    callback_url?: string;
    success_redirect_url?: string;
    failure_redirect_url?: string;
    addons?: {
      aml_screening?: boolean;
      address_verification?: boolean;
    };
  };
}

export interface StartVerificationResponse {
  session_id: string;
  verification_url: string;
  end_user: EndUser;
  expires_at: string;
}

export interface Webhook {
  id: string;
  organization_id: string;
  url: string;
  events: string[];
  secret_key: string;
  enabled: boolean;
  last_success_at?: string;
  last_failure_at?: string;
  failure_count: number;
  max_retries?: number;
  retry_backoff_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  organization_id: string;
  event_type: string;
  event_data: any;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  http_status_code?: number;
  response_body?: string;
  error_message?: string;
  attempts: number;
  max_retries: number;
  delivered_at?: string;
  next_retry_at?: string;
  created_at: string;
}

export interface WebhookFormData {
  url: string;
  events: string[];
  secret_key?: string;
  max_retries?: number;
  retry_backoff_minutes?: number;
}

export interface UsageStats {
  current_period: {
    verification_count: number;
    api_calls: number;
    storage_used_mb: number;
  };
  monthly_limit: number;
  overage_cost_per_verification: number;
}

export interface DashboardStats {
  period_days: number;
  verification_sessions: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    success_rate: number;
  };
  end_users: {
    total: number;
    verified: number;
    failed: number;
    pending: number;
    in_progress: number;
    manual_review: number;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  admin: Admin | null;
  organization: Organization | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface LoadingState {
  isLoading: boolean;
  message?: string;
}

export interface PaginationParams {
  page: number;
  per_page: number;
}

export interface TableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: any, item: T) => React.ReactNode;
}

export interface CreateOrganizationFormData {
  name: string;
  slug?: string;
  contact_email: string;
  admin_email: string;
  admin_password: string;
  admin_first_name: string;
  admin_last_name: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise';
}

export type VerificationStatus = 'pending' | 'processing' | 'verified' | 'failed' | 'manual_review' | 'expired';

export interface Verification {
  id: string;
  organization_id: string;
  end_user_id: string;
  idswyft_verification_id: string;
  idswyft_user_id: string;
  status: VerificationStatus;
  verification_type?: string;
  customer_email?: string;
  results: VerificationResults;
  confidence_score?: number;
  completed_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationDocument {
  id: string;
  verification_id: string;
  type: 'document_front' | 'document_back' | 'selfie' | 'liveness';
  url: string;
  analysis?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface ApiKeyPermissions {
  read_verifications: boolean;
  write_verifications: boolean;
  read_users: boolean;
  write_users: boolean;
  read_webhooks: boolean;
  write_webhooks: boolean;
  read_analytics: boolean;
  admin_access: boolean;
}

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  key_prefix: string;
  key_suffix: string;
  permissions: ApiKeyPermissions;
  environment: 'sandbox' | 'production';
  status: 'active' | 'disabled' | 'revoked';
  rate_limit?: number;
  allowed_ips?: string[];
  expires_at?: string;
  last_used_at?: string;
  usage_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyFormData {
  name: string;
  description?: string;
  permissions: ApiKeyPermissions;
  environment: 'sandbox' | 'production';
  rate_limit?: number;
  allowed_ips?: string[];
  expires_at?: string;
}

export interface ApiKeyCreateResponse {
  api_key: ApiKey;
  secret_key: string;
}

export interface ApiKeyUsage {
  api_key_id: string;
  date: string;
  request_count: number;
  success_count: number;
  error_count: number;
  rate_limit_hits: number;
}

export interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  verification_limit: number;
  api_calls_limit: number;
  storage_limit_gb: number;
  features: string[];
  is_popular?: boolean;
}

export interface BillingSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan_name: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing';
  current_period_start: string;
  current_period_end: string;
  trial_end?: string;
  billing_cycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoice {
  id: string;
  organization_id: string;
  subscription_id: string;
  number: string;
  status: 'paid' | 'open' | 'overdue' | 'draft' | 'void';
  amount_due: number;
  amount_paid: number;
  currency: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at?: string;
  invoice_url?: string;
  created_at: string;
}

export interface BillingUsageItem {
  date: string;
  verifications: number;
  api_calls: number;
  storage_mb: number;
  overage_verifications: number;
  overage_cost: number;
}

export interface BillingOverview {
  current_subscription: BillingSubscription;
  usage_current_period: UsageStats;
  upcoming_invoice?: {
    amount_due: number;
    due_date: string;
    period_end: string;
  };
  payment_method?: {
    type: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  billing_history: BillingInvoice[];
}

// Audit Log System Types (Organization-scoped)
export interface AuditLogEntry {
  id: string;
  organization_id: string; // Ensures organization-scoped access
  actor_type: 'admin' | 'api_key' | 'system';
  actor_id: string;
  actor_name: string;
  actor_email?: string;
  action: AuditAction;
  resource_type: AuditResourceType;
  resource_id?: string;
  resource_name?: string;
  details: Record<string, any>;
  metadata?: {
    ip_address?: string;
    user_agent?: string;
    api_key_name?: string;
    location?: string;
    session_id?: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'success' | 'failure' | 'warning';
  timestamp: string;
  created_at: string;
}

export type AuditAction = 
  // Authentication & Authorization
  | 'login' | 'logout' | 'login_failed' | 'password_reset' | 'password_changed'
  | 'session_expired' | 'account_locked' | 'mfa_enabled' | 'mfa_disabled'
  
  // User Management
  | 'user_created' | 'user_updated' | 'user_deleted' | 'user_suspended'
  | 'user_activated' | 'user_permissions_changed' | 'user_role_changed'
  
  // API Key Management
  | 'api_key_created' | 'api_key_updated' | 'api_key_deleted' | 'api_key_rotated'
  | 'api_key_permissions_changed' | 'api_key_suspended' | 'api_key_usage_exceeded'
  
  // Verification Operations
  | 'verification_created' | 'verification_updated' | 'verification_deleted'
  | 'verification_approved' | 'verification_rejected' | 'verification_flagged'
  | 'manual_review_assigned' | 'manual_review_completed'
  
  // Organization & Settings
  | 'organization_updated' | 'settings_changed' | 'webhook_created'
  | 'webhook_updated' | 'webhook_deleted' | 'webhook_test_sent'
  
  // Billing & Subscription
  | 'plan_upgraded' | 'plan_downgraded' | 'payment_method_added'
  | 'payment_method_removed' | 'invoice_generated' | 'payment_succeeded'
  | 'payment_failed' | 'subscription_cancelled'
  
  // Security Events
  | 'suspicious_activity_detected' | 'rate_limit_exceeded' | 'unauthorized_access_attempt'
  | 'data_export_requested' | 'data_export_completed' | 'data_deletion_requested'
  | 'data_deletion_completed' | 'compliance_report_generated'
  
  // System Operations
  | 'backup_created' | 'backup_restored' | 'maintenance_started'
  | 'maintenance_completed' | 'system_alert_triggered';

export type AuditResourceType = 
  | 'user' | 'admin' | 'organization' | 'verification' | 'document'
  | 'api_key' | 'webhook' | 'settings' | 'billing' | 'subscription'
  | 'report' | 'export' | 'backup' | 'system';

export interface AuditLogFilters {
  actor_type?: 'admin' | 'api_key' | 'system';
  actor_id?: string;
  action?: AuditAction;
  resource_type?: AuditResourceType;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'success' | 'failure' | 'warning';
  date_from?: string;
  date_to?: string;
  ip_address?: string;
  search?: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next_page: boolean;
  has_prev_page: boolean;
}

export interface AuditLogStats {
  total_events_today: number;
  total_events_week: number;
  total_events_month: number;
  security_alerts_count: number;
  failed_login_attempts: number;
  api_key_usage_violations: number;
  recent_critical_events: AuditLogEntry[];
  activity_by_hour: Array<{
    hour: string;
    count: number;
  }>;
  activity_by_action: Array<{
    action: AuditAction;
    count: number;
  }>;
  top_actors: Array<{
    actor_name: string;
    actor_type: 'admin' | 'api_key' | 'system';
    event_count: number;
  }>;
}

// Admin User Management Types (Organization-scoped)
export interface AdminRole {
  id: string;
  name: string;
  display_name: string;
  description: string;
  permissions: AdminPermission[];
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminPermission {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: PermissionCategory;
  is_system_permission: boolean;
}

export type PermissionCategory = 
  | 'dashboard' | 'verifications' | 'users' | 'webhooks' | 'analytics'
  | 'organization' | 'billing' | 'api_keys' | 'audit_logs' | 'settings'
  | 'admin_management' | 'system';

export interface AdminUser {
  id: string;
  organization_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role_id: string;
  role: AdminRole;
  status: AdminStatus;
  last_login_at?: string;
  last_ip_address?: string;
  failed_login_attempts: number;
  locked_until?: string;
  email_verified: boolean;
  phone_number?: string;
  avatar_url?: string;
  timezone?: string;
  language?: string;
  two_factor_enabled: boolean;
  invite_token?: string;
  invite_expires_at?: string;
  invited_by?: string;
  created_at: string;
  updated_at: string;
}

export type AdminStatus = 'active' | 'inactive' | 'pending' | 'suspended' | 'locked';

export interface AdminUserFormData {
  email: string;
  first_name: string;
  last_name: string;
  role_id: string;
  phone_number?: string;
  timezone?: string;
  language?: string;
  send_invite?: boolean;
}

export interface AdminUserUpdateData {
  first_name?: string;
  last_name?: string;
  role_id?: string;
  phone_number?: string;
  timezone?: string;
  language?: string;
  status?: AdminStatus;
}

export interface AdminUserInvite {
  id: string;
  organization_id: string;
  email: string;
  role_id: string;
  role: AdminRole;
  invited_by: string;
  invited_by_name: string;
  invite_token: string;
  expires_at: string;
  accepted_at?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  created_at: string;
}

export interface AdminUserStats {
  total_admins: number;
  active_admins: number;
  pending_invites: number;
  suspended_admins: number;
  admins_by_role: Array<{
    role_name: string;
    count: number;
  }>;
  recent_logins: Array<{
    admin_id: string;
    admin_name: string;
    login_at: string;
    ip_address: string;
  }>;
  recent_invites: AdminUserInvite[];
}

export interface AdminUserFilters {
  role_id?: string;
  status?: AdminStatus;
  search?: string;
  last_login_from?: string;
  last_login_to?: string;
  created_from?: string;
  created_to?: string;
}

export interface AdminUserResponse {
  users: AdminUser[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next_page: boolean;
  has_prev_page: boolean;
}

export interface RolePermissionUpdate {
  role_id: string;
  permission_ids: string[];
}

export interface AdminUserPasswordReset {
  admin_id: string;
  temporary_password?: string;
  require_password_change: boolean;
  send_email: boolean;
}

export interface ActiveSession {
  id: string;
  ip: string;
  userAgent: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export interface ProviderSummary {
  totalRequests: number;
  successRate: number;    // 0.0 – 1.0
  avgLatencyMs: number;
  avgConfidence: number;  // 0.0 – 1.0
  providerName: string;
}

export type ProviderType = 'ocr' | 'face' | 'liveness';

// Notification types
export type NotificationType =
  | 'verification.completed' | 'verification.failed'
  | 'verification.manual_review' | 'verification.overridden'
  | 'webhook.delivery_failed' | 'user.created';

export interface AdminNotification {
  id: string;
  organization_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

// Global search result types
export interface SearchResults {
  verifications: Array<{
    id: string;
    status: string;
    confidence_score?: number;
    created_at: string;
    end_user_id: string;
    vaas_end_users?: { first_name?: string; last_name?: string; email?: string };
  }>;
  users: Array<{
    id: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    external_id?: string;
    verification_status: string;
    created_at: string;
  }>;
  webhooks: Array<{
    id: string;
    url: string;
    enabled: boolean;
    failure_count: number;
    created_at: string;
  }>;
  audit_logs: Array<{
    id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    actor_name: string;
    severity: string;
    created_at: string;
  }>;
  api_keys: Array<{
    id: string;
    key_name: string;
    key_prefix: string;
    is_active: boolean;
    created_at: string;
  }>;
}
