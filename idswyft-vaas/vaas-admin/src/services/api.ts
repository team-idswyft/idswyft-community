import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { createApiClient, RetryAfterError, type ApiError } from '../lib/apiClient';
import {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  Admin,
  Organization,
  EndUser,
  VerificationSession,
  StartVerificationRequest,
  StartVerificationResponse,
  Webhook,
  WebhookDelivery,
  WebhookFormData,
  UsageStats,
  DashboardStats,
  PaginationParams,
  ApiKey,
  ApiKeyFormData,
  ApiKeyCreateResponse,
  ApiKeyUsage,
  BillingPlan,
  BillingSubscription,
  BillingInvoice,
  BillingOverview,
  BillingUsageItem,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogResponse,
  AuditLogStats,
  AdminRole,
  AdminPermission,
  AdminUser,
  AdminUserFormData,
  AdminUserUpdateData,
  AdminUserInvite,
  AdminUserStats,
  AdminUserFilters,
  AdminUserResponse,
  RolePermissionUpdate,
  AdminUserPasswordReset,
  AssetUploadResult,
  PlatformBranding,
  OrgAssets,
  AdminNotification,
  SearchResults
} from '../types.js';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    const BASE_URL = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL
      : 'http://localhost:3002/api';
    console.log('[API Client] Initializing with baseURL:', BASE_URL);

    this.client = createApiClient(BASE_URL);

    // Load token from localStorage
    this.token = localStorage.getItem('vaas_admin_token');
    if (this.token) {
      this.setAuthHeader(this.token);
    }

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const fullUrl = config.baseURL ? `${config.baseURL}${config.url}` : config.url;
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        console.log(`[API] Full URL: ${fullUrl}`);
        console.log(`[API] Base URL: ${config.baseURL}`);
        return config;
      },
      (error) => {
        console.error('[API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor — 401 redirect only
    // Error normalisation (429, CSRF, shape) is handled by the createApiClient factory.
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error instanceof RetryAfterError) {
          console.warn(`[API] Rate limited. Retry after ${error.retryAfter} seconds.`);
          throw error;
        }
        const apiError = error as ApiError;
        const msg = apiError.correlationId
          ? `[API] Error [${apiError.correlationId}]: ${apiError.message}`
          : `[API] Error: ${apiError.message ?? 'Unknown error'}`;
        console.error(msg);
        // Redirect to login on 401 (session expired / unauthenticated)
        if ((error as ApiError)?.status === 401) {
          this.clearToken();
          window.location.href = '/login';
          return new Promise(() => {}); // intentionally never resolves — page is navigating away
        }
        return Promise.reject(error);
      }
    );
  }

  private setAuthHeader(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  private clearToken() {
    this.token = null;
    localStorage.removeItem('vaas_admin_token');
    delete this.client.defaults.headers.common['Authorization'];
  }

  // Authentication
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response: AxiosResponse<ApiResponse<LoginResponse>> = await this.client.post('/auth/login', credentials);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Login failed');
    }

    const loginData = response.data.data!;
    if ((loginData as any).mfa_required) {
      return loginData; // MFA step — no JWT yet, don't store anything
    }
    this.token = loginData.token;
    localStorage.setItem('vaas_admin_token', this.token);
    this.setAuthHeader(this.token);

    return loginData;
  }

  async verifyTotp(tempToken: string, totpCode: string): Promise<{ token: string }> {
    const response: AxiosResponse<ApiResponse<{ token: string }>> = await this.client.post('/auth/totp/verify', {
      temp_token: tempToken,
      totp_code: totpCode,
    });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'TOTP verification failed');
    }
    const data = response.data.data!;
    if (!data.token || typeof data.token !== 'string') {
      throw new Error('TOTP verification returned an invalid token');
    }
    this.token = data.token;
    localStorage.setItem('vaas_admin_token', this.token);
    this.setAuthHeader(this.token);
    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      this.clearToken();
    }
  }

  async forgotPassword(email: string): Promise<void> {
    await this.client.post('/auth/forgot-password', { email });
  }

  async resetPassword(token: string, new_password: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.post('/auth/reset-password', { token, new_password });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to reset password');
    }
  }

  async getCurrentAdmin(): Promise<{ admin: Admin; organization: Organization }> {
    const response: AxiosResponse<ApiResponse> = await this.client.get('/auth/me');
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin info');
    }

    return response.data.data!;
  }

  // Organizations
  async getOrganization(id: string): Promise<Organization> {
    const response: AxiosResponse<ApiResponse<Organization>> = await this.client.get(`/organizations/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get organization');
    }

    return response.data.data!;
  }

  async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization> {
    const response: AxiosResponse<ApiResponse<Organization>> = await this.client.put(`/organizations/${id}`, updates);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update organization');
    }

    return response.data.data!;
  }

  async getOrganizationUsage(id: string): Promise<UsageStats> {
    const response: AxiosResponse<ApiResponse<UsageStats>> = await this.client.get(`/organizations/${id}/usage`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get usage stats');
    }

    return response.data.data!;
  }

  // Verifications
  async listVerifications(params?: {
    status?: string;
    user_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ verifications: VerificationSession[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<VerificationSession[]>> = await this.client.get('/verifications', { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list verifications');
    }

    return {
      verifications: response.data.data!,
      meta: response.data.meta || {}
    };
  }

  async getVerification(id: string): Promise<VerificationSession> {
    const response: AxiosResponse<ApiResponse<VerificationSession>> = await this.client.get(`/verifications/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get verification');
    }

    return response.data.data!;
  }

  async getVerificationDocuments(id: string): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.client.get(`/verifications/${id}/documents`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get documents');
    }

    return response.data.data || [];
  }

  async getVerificationDocumentUrl(verificationId: string, documentId: string): Promise<{ url: string; mimetype: string }> {
    const response: AxiosResponse<ApiResponse<{ url: string; expires_in: number; mimetype: string }>> =
      await this.client.get(`/verifications/${verificationId}/documents/${documentId}/url`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get document URL');
    }

    return response.data.data!;
  }

  async startVerification(request: StartVerificationRequest): Promise<StartVerificationResponse> {
    const response: AxiosResponse<ApiResponse<StartVerificationResponse>> = await this.client.post('/verifications/start', request);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to start verification');
    }

    return response.data.data!;
  }

  async approveVerification(id: string, notes?: string): Promise<VerificationSession> {
    const response: AxiosResponse<ApiResponse<VerificationSession>> = await this.client.post(`/verifications/${id}/approve`, { notes });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to approve verification');
    }

    return response.data.data!;
  }

  async rejectVerification(id: string, reason: string, notes?: string): Promise<VerificationSession> {
    const response: AxiosResponse<ApiResponse<VerificationSession>> = await this.client.post(`/verifications/${id}/reject`, { reason, notes });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to reject verification');
    }

    return response.data.data!;
  }

  async syncVerification(id: string): Promise<VerificationSession> {
    const response: AxiosResponse<ApiResponse<VerificationSession>> = await this.client.post(`/verifications/${id}/sync`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to sync verification');
    }

    return response.data.data!;
  }

  async getVerificationStats(days: number = 30): Promise<DashboardStats> {
    const response: AxiosResponse<ApiResponse<DashboardStats>> = await this.client.get('/verifications/stats/overview', {
      params: { days }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get verification stats');
    }

    return response.data.data!;
  }

  async getVerificationTrend(days: number = 30): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.client.get('/verifications/stats/verification-trend', {
      params: { days }
    });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get verification trend');
    }

    return response.data.data!;
  }

  // Webhooks
  async listWebhooks(): Promise<Webhook[]> {
    const response: AxiosResponse<ApiResponse<Webhook[]>> = await this.client.get('/webhooks');
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list webhooks');
    }

    return response.data.data!;
  }

  async getWebhook(id: string): Promise<Webhook> {
    const response: AxiosResponse<ApiResponse<Webhook>> = await this.client.get(`/webhooks/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get webhook');
    }

    return response.data.data!;
  }

  async createWebhook(data: WebhookFormData): Promise<Webhook> {
    const response: AxiosResponse<ApiResponse<Webhook>> = await this.client.post('/webhooks', data);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create webhook');
    }

    return response.data.data!;
  }

  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook> {
    const response: AxiosResponse<ApiResponse<Webhook>> = await this.client.put(`/webhooks/${id}`, updates);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update webhook');
    }

    return response.data.data!;
  }

  async deleteWebhook(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.delete(`/webhooks/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete webhook');
    }
  }

  async testWebhook(id: string): Promise<{ success: boolean; status_code?: number; error?: string }> {
    const response: AxiosResponse<ApiResponse> = await this.client.post(`/webhooks/${id}/test`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to test webhook');
    }

    return response.data.data!;
  }

  async getWebhookDeliveries(id: string, params?: PaginationParams): Promise<{ deliveries: WebhookDelivery[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<WebhookDelivery[]>> = await this.client.get(`/webhooks/${id}/deliveries`, { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get webhook deliveries');
    }

    return {
      deliveries: response.data.data!,
      meta: response.data.meta || {}
    };
  }

  async getWebhookSecret(webhookId: string): Promise<string> {
    const response: AxiosResponse<ApiResponse<{ secret: string }>> = await this.client.get(`/webhooks/${webhookId}/secret`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch webhook secret');
    }
    return response.data.data!.secret;
  }

  // End Users
  async listEndUsers(params?: {
    status?: string;
    search?: string;
    tags?: string[];
    page?: number;
    per_page?: number;
  }): Promise<{ users: EndUser[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<EndUser[]>> = await this.client.get('/users', { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list end users');
    }

    return {
      users: response.data.data!,
      meta: response.data.meta || {}
    };
  }

  async getEndUser(id: string): Promise<EndUser> {
    const response: AxiosResponse<ApiResponse<EndUser>> = await this.client.get(`/users/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get end user');
    }

    return response.data.data!;
  }

  async createEndUser(userData: Partial<EndUser>): Promise<EndUser> {
    const response: AxiosResponse<ApiResponse<EndUser>> = await this.client.post('/users', userData);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create end user');
    }

    return response.data.data!;
  }

  async updateEndUser(id: string, updates: Partial<EndUser>): Promise<EndUser> {
    const response: AxiosResponse<ApiResponse<EndUser>> = await this.client.put(`/users/${id}`, updates);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update end user');
    }

    return response.data.data!;
  }

  async deleteEndUser(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.delete(`/users/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete end user');
    }
  }

  async getEndUserVerifications(id: string, params?: PaginationParams): Promise<{ verifications: VerificationSession[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get(`/users/${id}/verifications`, { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get user verifications');
    }

    // Backend returns { user, verification_sessions: [...] } inside data
    const responseData = response.data.data!;
    return {
      verifications: Array.isArray(responseData) ? responseData : (responseData.verification_sessions || []),
      meta: response.data.meta || {}
    };
  }

  async exportEndUsers(params?: {
    status?: string;
    search?: string;
    tags?: string[];
  }): Promise<Blob> {
    const response = await this.client.get('/users/export', {
      params,
      responseType: 'blob'
    });
    
    return response.data;
  }


  // API Keys
  async listApiKeys(): Promise<ApiKey[]> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.client.get('/api-keys');
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list API keys');
    }

    // Transform VaaS backend response to match frontend expectations
    const vaasKeys = response.data.data || [];
    const transformedKeys: ApiKey[] = vaasKeys.map((vaasKey: any) => ({
      id: vaasKey.id,
      organization_id: vaasKey.organization_id || '',
      name: vaasKey.key_name,
      description: vaasKey.description || '',
      key_prefix: vaasKey.key_prefix,
      key_suffix: '***', // VaaS backend doesn't provide suffix
      permissions: {
        read_verifications: true, // VaaS keys have basic permissions
        write_verifications: true,
        read_users: true,
        write_users: false,
        read_webhooks: false,
        write_webhooks: false,
        read_analytics: false,
        admin_access: false
      },
      environment: 'production', // Default for VaaS keys
      status: vaasKey.is_active ? 'active' : 'disabled',
      rate_limit: undefined,
      allowed_ips: undefined,
      expires_at: vaasKey.expires_at,
      last_used_at: vaasKey.last_used_at,
      usage_count: 0, // VaaS backend doesn't track usage yet
      created_by: '',
      created_at: vaasKey.created_at,
      updated_at: vaasKey.updated_at || vaasKey.created_at
    }));

    return transformedKeys;
  }

  async getApiKey(id: string): Promise<ApiKey> {
    const response: AxiosResponse<ApiResponse<ApiKey>> = await this.client.get(`/api-keys/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get API key');
    }

    return response.data.data!;
  }

  async createApiKey(data: ApiKeyFormData): Promise<ApiKeyCreateResponse> {
    // Transform frontend data to match VaaS backend API expectations
    const vaasApiData = {
      key_name: data.name,
      description: data.description || undefined,
      expires_in_days: data.expires_at ? 
        Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 
        undefined
    };

    const response: AxiosResponse<ApiResponse<any>> = await this.client.post('/api-keys', vaasApiData);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create API key');
    }

    const vaasResponse = response.data.data;
    
    // Transform VaaS backend response to match frontend expectations
    const transformedResponse: ApiKeyCreateResponse = {
      api_key: {
        id: vaasResponse.key_info.id,
        organization_id: '', // Will be filled by the backend
        name: vaasResponse.key_info.key_name,
        description: vaasResponse.key_info.description || '',
        key_prefix: vaasResponse.key_info.key_prefix,
        key_suffix: '***', // VaaS backend doesn't provide suffix
        permissions: {
          read_verifications: true, // VaaS keys have basic permissions
          write_verifications: true,
          read_users: true,
          write_users: false,
          read_webhooks: false,
          write_webhooks: false,
          read_analytics: false,
          admin_access: false
        },
        environment: data.environment,
        status: 'active',
        rate_limit: data.rate_limit,
        allowed_ips: data.allowed_ips,
        expires_at: vaasResponse.key_info.expires_at,
        last_used_at: undefined,
        usage_count: 0,
        created_by: '',
        created_at: vaasResponse.key_info.created_at,
        updated_at: vaasResponse.key_info.created_at
      },
      secret_key: vaasResponse.secret_key
    };

    return transformedResponse;
  }

  async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey> {
    const response: AxiosResponse<ApiResponse<ApiKey>> = await this.client.put(`/api-keys/${id}`, updates);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update API key');
    }

    return response.data.data!;
  }

  async deleteApiKey(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.delete(`/api-keys/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete API key');
    }
  }

  async rotateApiKey(id: string): Promise<{ secret_key: string }> {
    const response: AxiosResponse<ApiResponse<{ secret_key: string }>> = await this.client.post(`/api-keys/${id}/rotate`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to rotate API key');
    }

    return response.data.data!;
  }

  async getApiKeyUsage(id: string, params?: { 
    start_date?: string; 
    end_date?: string; 
    granularity?: 'hour' | 'day' | 'month' 
  }): Promise<ApiKeyUsage[]> {
    const response: AxiosResponse<ApiResponse<ApiKeyUsage[]>> = await this.client.get(`/api-keys/${id}/usage`, { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get API key usage');
    }

    return response.data.data!;
  }

  // Billing
  async getBillingOverview(organizationId: string): Promise<BillingOverview> {
    const response: AxiosResponse<ApiResponse<BillingOverview>> = await this.client.get(`/organizations/${organizationId}/billing`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get billing overview');
    }

    return response.data.data!;
  }

  async listBillingPlans(): Promise<BillingPlan[]> {
    const response: AxiosResponse<ApiResponse<BillingPlan[]>> = await this.client.get('/billing/plans');
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list billing plans');
    }

    return response.data.data!;
  }

  async changeBillingPlan(subscriptionId: string, planId: string, billingCycle: 'monthly' | 'yearly'): Promise<BillingSubscription> {
    const response: AxiosResponse<ApiResponse<BillingSubscription>> = await this.client.post(`/billing/subscriptions/${subscriptionId}/change-plan`, {
      plan_id: planId,
      billing_cycle: billingCycle
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to change billing plan');
    }

    return response.data.data!;
  }

  async getBillingInvoices(organizationId: string, params?: { limit?: number; status?: string }): Promise<BillingInvoice[]> {
    const response: AxiosResponse<ApiResponse<BillingInvoice[]>> = await this.client.get(`/organizations/${organizationId}/billing/invoices`, { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get billing invoices');
    }

    return response.data.data!;
  }

  async getBillingUsageHistory(organizationId: string, params?: { 
    start_date?: string; 
    end_date?: string; 
    granularity?: 'day' | 'month' 
  }): Promise<BillingUsageItem[]> {
    const response: AxiosResponse<ApiResponse<BillingUsageItem[]>> = await this.client.get(`/organizations/${organizationId}/billing/usage-history`, { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get usage history');
    }

    return response.data.data!;
  }

  async downloadInvoice(invoiceId: string): Promise<Blob> {
    const response = await this.client.get(`/billing/invoices/${invoiceId}/download`, {
      responseType: 'blob'
    });
    
    return response.data;
  }

  async updatePaymentMethod(organizationId: string, paymentMethodId: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.post(`/organizations/${organizationId}/billing/payment-method`, {
      payment_method_id: paymentMethodId
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update payment method');
    }
  }

  // Audit Logs API methods (Organization-scoped)
  // Backend DB columns: id, organization_id, admin_id, action, resource_type, resource_id,
  //   details, ip_address, user_agent, created_at
  // Frontend AuditLogEntry expects: actor_type, actor_name, actor_email, timestamp,
  //   status, severity, metadata (object), etc.
  // We transform each row in the API client adapter layer.
  async getAuditLogs(organizationId: string, params?: AuditLogFilters & PaginationParams): Promise<AuditLogResponse> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get(`/organizations/${organizationId}/audit-logs`, { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get audit logs');
    }

    const raw = response.data.data!;
    const rawLogs: any[] = raw.audit_logs ?? raw.entries ?? [];
    const meta = raw.meta ?? {};
    const page = meta.page ?? params?.page ?? 1;
    const totalPages = meta.total_pages ?? 1;

    // Transform each raw DB row → AuditLogEntry
    const entries: AuditLogEntry[] = rawLogs.map((row: any) => {
      // Normalise action: backend stores "auth.login_success" → frontend expects "login"
      const rawAction: string = row.action || 'unknown';
      const shortAction = rawAction.includes('.') ? rawAction.split('.').pop()! : rawAction;

      // Derive severity from action name
      const failActions = ['login_failed', 'account_locked', 'unauthorized_access_attempt', 'rate_limit_exceeded'];
      const highActions = ['password_reset', 'password_changed', 'user_deleted', 'api_key_deleted', 'data_deletion_requested'];
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (failActions.includes(shortAction)) severity = 'high';
      else if (highActions.includes(shortAction)) severity = 'medium';

      // Derive status from action name
      let status: 'success' | 'failure' | 'warning' = 'success';
      if (shortAction.includes('failed') || shortAction.includes('locked') || shortAction.includes('exceeded')) {
        status = 'failure';
      } else if (shortAction.includes('flagged') || shortAction.includes('suspicious')) {
        status = 'warning';
      }

      return {
        id: row.id,
        organization_id: row.organization_id,
        actor_type: row.actor_type ?? 'admin',
        actor_id: row.actor_id ?? row.admin_id ?? '',
        actor_name: row.actor_name ?? (row.admin_id ? row.admin_id.substring(0, 8) : 'System'),
        actor_email: row.actor_email ?? undefined,
        action: shortAction as AuditLogEntry['action'],
        resource_type: (row.resource_type || 'system') as AuditLogEntry['resource_type'],
        resource_id: row.resource_id ?? undefined,
        resource_name: row.resource_name ?? (row.resource_id ? row.resource_id.substring(0, 12) : undefined),
        details: row.details || {},
        metadata: row.metadata ?? {
          ip_address: row.ip_address ?? undefined,
          user_agent: row.user_agent ?? undefined,
        },
        severity: row.severity ?? severity,
        status: row.status ?? status,
        timestamp: row.timestamp ?? row.created_at,
        created_at: row.created_at,
      };
    });

    return {
      entries,
      total: meta.total_count ?? meta.total ?? rawLogs.length,
      page,
      per_page: meta.per_page ?? params?.per_page ?? 20,
      total_pages: totalPages,
      has_next_page: meta.has_more ?? page < totalPages,
      has_prev_page: page > 1,
    };
  }

  // Backend returns { total_logs, period_days, action_breakdown, most_active_actions }
  // but frontend expects AuditLogStats with different field names
  async getAuditLogStats(organizationId: string): Promise<AuditLogStats> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get(`/organizations/${organizationId}/audit-logs/stats`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get audit log statistics');
    }

    const raw = response.data.data!;

    return {
      total_events_today: raw.total_events_today ?? 0,
      total_events_week: raw.total_events_week ?? 0,
      total_events_month: raw.total_logs ?? raw.total_events_month ?? 0,
      security_alerts_count: raw.security_alerts_count ?? 0,
      failed_login_attempts: raw.failed_login_attempts ?? 0,
      api_key_usage_violations: raw.api_key_usage_violations ?? 0,
      recent_critical_events: raw.recent_critical_events ?? [],
      activity_by_hour: raw.activity_by_hour ?? [],
      activity_by_action: raw.most_active_actions ?? raw.activity_by_action ?? [],
      top_actors: raw.top_actors ?? [],
    };
  }

  async exportAuditLogs(organizationId: string, filters?: AuditLogFilters & { format?: 'csv' | 'json' }): Promise<Blob> {
    const response = await this.client.get(`/organizations/${organizationId}/audit-logs/export`, {
      params: filters,
      responseType: 'blob'
    });

    if (response.status !== 200) {
      throw new Error('Failed to export audit logs');
    }

    return response.data;
  }

  async createAuditLog(organizationId: string, entry: Omit<AuditLogEntry, 'id' | 'organization_id' | 'created_at' | 'timestamp'>): Promise<AuditLogEntry> {
    const response: AxiosResponse<ApiResponse<AuditLogEntry>> = await this.client.post(`/organizations/${organizationId}/audit-logs`, entry);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create audit log entry');
    }

    return response.data.data!;
  }

  // Admin User Management API methods (Organization-scoped)
  
  // Roles and Permissions
  async getAdminRoles(organizationId: string): Promise<AdminRole[]> {
    const response: AxiosResponse<ApiResponse<AdminRole[]>> = await this.client.get(`/organizations/${organizationId}/admin-roles`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin roles');
    }

    return response.data.data!;
  }

  async getAdminPermissions(): Promise<AdminPermission[]> {
    const response: AxiosResponse<ApiResponse<AdminPermission[]>> = await this.client.get('/admin-permissions');
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin permissions');
    }

    return response.data.data!;
  }

  async updateRolePermissions(organizationId: string, data: RolePermissionUpdate): Promise<AdminRole> {
    const response: AxiosResponse<ApiResponse<AdminRole>> = await this.client.put(`/organizations/${organizationId}/admin-roles/${data.role_id}/permissions`, {
      permission_ids: data.permission_ids
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update role permissions');
    }

    return response.data.data!;
  }

  // Admin Users CRUD
  async getAdminUsers(organizationId: string, params?: AdminUserFilters & PaginationParams): Promise<AdminUserResponse> {
    const response: AxiosResponse<ApiResponse<AdminUserResponse>> = await this.client.get(`/organizations/${organizationId}/admin-users`, { params });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin users');
    }

    return response.data.data!;
  }

  async getAdminUser(organizationId: string, adminId: string): Promise<AdminUser> {
    const response: AxiosResponse<ApiResponse<AdminUser>> = await this.client.get(`/organizations/${organizationId}/admin-users/${adminId}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin user');
    }

    return response.data.data!;
  }

  async createAdminUser(organizationId: string, data: AdminUserFormData): Promise<AdminUser> {
    const response: AxiosResponse<ApiResponse<AdminUser>> = await this.client.post(`/organizations/${organizationId}/admin-users`, data);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create admin user');
    }

    return response.data.data!;
  }

  async updateAdminUser(organizationId: string, adminId: string, data: AdminUserUpdateData): Promise<AdminUser> {
    const response: AxiosResponse<ApiResponse<AdminUser>> = await this.client.put(`/organizations/${organizationId}/admin-users/${adminId}`, data);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update admin user');
    }

    return response.data.data!;
  }

  async deleteAdminUser(organizationId: string, adminId: string): Promise<void> {
    const response: AxiosResponse<ApiResponse<void>> = await this.client.delete(`/organizations/${organizationId}/admin-users/${adminId}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete admin user');
    }
  }

  // Admin User Status Management
  async suspendAdminUser(organizationId: string, adminId: string, reason?: string): Promise<AdminUser> {
    const response: AxiosResponse<ApiResponse<AdminUser>> = await this.client.post(`/organizations/${organizationId}/admin-users/${adminId}/suspend`, { reason });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to suspend admin user');
    }

    return response.data.data!;
  }

  async activateAdminUser(organizationId: string, adminId: string): Promise<AdminUser> {
    const response: AxiosResponse<ApiResponse<AdminUser>> = await this.client.post(`/organizations/${organizationId}/admin-users/${adminId}/activate`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to activate admin user');
    }

    return response.data.data!;
  }

  async unlockAdminUser(organizationId: string, adminId: string): Promise<AdminUser> {
    const response: AxiosResponse<ApiResponse<AdminUser>> = await this.client.post(`/organizations/${organizationId}/admin-users/${adminId}/unlock`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to unlock admin user');
    }

    return response.data.data!;
  }

  // Admin User Invites
  async getAdminUserInvites(organizationId: string): Promise<AdminUserInvite[]> {
    const response: AxiosResponse<ApiResponse<AdminUserInvite[]>> = await this.client.get(`/organizations/${organizationId}/admin-invites`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin invites');
    }

    return response.data.data!;
  }

  async resendAdminInvite(organizationId: string, inviteId: string): Promise<AdminUserInvite> {
    const response: AxiosResponse<ApiResponse<AdminUserInvite>> = await this.client.post(`/organizations/${organizationId}/admin-invites/${inviteId}/resend`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to resend admin invite');
    }

    return response.data.data!;
  }

  async revokeAdminInvite(organizationId: string, inviteId: string): Promise<void> {
    const response: AxiosResponse<ApiResponse<void>> = await this.client.delete(`/organizations/${organizationId}/admin-invites/${inviteId}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to revoke admin invite');
    }
  }

  // Password Management
  async resetAdminPassword(organizationId: string, adminId: string, data: AdminUserPasswordReset): Promise<{ temporary_password?: string }> {
    const response: AxiosResponse<ApiResponse<{ temporary_password?: string }>> = await this.client.post(`/organizations/${organizationId}/admin-users/${adminId}/reset-password`, data);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to reset admin password');
    }

    return response.data.data!;
  }

  // Statistics and Analytics
  async getAdminUserStats(organizationId: string): Promise<AdminUserStats> {
    const response: AxiosResponse<ApiResponse<AdminUserStats>> = await this.client.get(`/organizations/${organizationId}/admin-users/stats`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin user statistics');
    }

    return response.data.data!;
  }

  // Bulk Operations
  async bulkUpdateAdminUsers(organizationId: string, updates: Array<{ admin_id: string; data: AdminUserUpdateData }>): Promise<AdminUser[]> {
    const response: AxiosResponse<ApiResponse<AdminUser[]>> = await this.client.post(`/organizations/${organizationId}/admin-users/bulk-update`, { updates });
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to bulk update admin users');
    }

    return response.data.data!;
  }

  // Notifications
  async getNotifications(params?: { read?: boolean; page?: number; per_page?: number }): Promise<{ notifications: AdminNotification[]; total: number }> {
    const response: AxiosResponse<ApiResponse<AdminNotification[]>> = await this.client.get('/notifications', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get notifications');
    }

    return {
      notifications: response.data.data!,
      total: response.data.meta?.total || 0,
    };
  }

  async getUnreadNotificationCount(): Promise<number> {
    const response: AxiosResponse<ApiResponse<{ count: number }>> = await this.client.get('/notifications/unread-count');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get unread count');
    }

    return response.data.data!.count;
  }

  async markNotificationRead(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.post(`/notifications/${id}/read`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to mark notification as read');
    }
  }

  async markAllNotificationsRead(): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await this.client.post('/notifications/read-all');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to mark all as read');
    }
  }

  // Global search
  async search(q: string, limit?: number): Promise<SearchResults> {
    const response: AxiosResponse<ApiResponse<SearchResults>> = await this.client.get('/search', {
      params: { q, limit: limit || 5 },
    });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Search failed');
    }

    return response.data.data!;
  }

  // Generic HTTP methods
  async get(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.get(url, config);
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.post(url, data, config);
  }

  async put(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.put(url, data, config);
  }

  async patch(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.patch(url, data, config);
  }

  async delete(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.delete(url, config);
  }

  // Send verification invitation to a user
  async sendVerificationInvitation(userId: string, options?: {
    custom_message?: string;
    expiration_days?: number;
  }): Promise<EndUser> {
    console.log(`[API] Sending verification invitation to user ${userId}:`, options);
    
    const response: AxiosResponse<ApiResponse<EndUser>> = await this.client.post(`/users/${userId}/send-verification-invitation`, options);
    
    console.log(`[API] Verification invitation response:`, response.data);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to send verification invitation');
    }

    return response.data.data!;
  }



  // Asset management
  async uploadOrgAsset(orgId: string, assetType: string, file: File): Promise<AssetUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response: AxiosResponse<ApiResponse<AssetUploadResult>> = await this.client.post(
      `/assets/organizations/${orgId}/${assetType}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Upload failed');
    }
    return response.data.data!;
  }

  async uploadPlatformAsset(assetType: string, file: File): Promise<AssetUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response: AxiosResponse<ApiResponse<AssetUploadResult>> = await this.client.post(
      `/assets/platform/${assetType}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Upload failed');
    }
    return response.data.data!;
  }

  async getPlatformBranding(): Promise<PlatformBranding> {
    const response: AxiosResponse<ApiResponse<PlatformBranding>> =
      await this.client.get('/assets/platform');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get platform branding');
    }
    return response.data.data!;
  }

  async getOrgAssets(orgId: string): Promise<OrgAssets> {
    const response: AxiosResponse<ApiResponse<OrgAssets>> =
      await this.client.get(`/assets/organizations/${orgId}`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get org assets');
    }
    return response.data.data!;
  }

  // Utility methods
  isAuthenticated(): boolean {
    return !!this.token;
  }

  getToken(): string | null {
    return this.token;
  }

  /** Store a JWT received from SSO callback (URL fragment). */
  setToken(token: string) {
    this.token = token;
    localStorage.setItem('vaas_admin_token', token);
    this.setAuthHeader(token);
  }
}

export const apiClient = new ApiClient();
export default apiClient;