import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { createApiClient, RetryAfterError, type ApiError } from '../lib/apiClient';

// ── Response envelope ────────────────────────────────────────────────────────
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { message: string; correlationId?: string };
  meta?: any;
}

// ── Public types ─────────────────────────────────────────────────────────────
export interface PlatformAdmin {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  billing_status: string;
  created_at: string;
  [key: string]: any;
}

export interface DeveloperInfo {
  id: string;
  email: string;
  name: string;
  company?: string;
  status: 'active' | 'suspended';
  is_verified: boolean;
  avatar_url?: string;
  created_at: string;
  api_key_count: number;
  verification_count: number;
}

// ── API Client ───────────────────────────────────────────────────────────────
class PlatformApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api/platform';

    this.client = createApiClient(BASE_URL);

    // Load token from localStorage
    this.token = localStorage.getItem('platform_admin_token');
    if (this.token) {
      this.setAuthHeader(this.token);
    }

    // Response interceptor — 401 redirect
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error instanceof RetryAfterError) {
          throw error;
        }
        const apiError = error as ApiError;
        if (apiError?.status === 401) {
          this.clearToken();
          window.location.href = '/login';
          return new Promise(() => {}); // page is navigating away
        }
        return Promise.reject(error);
      }
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private setAuthHeader(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  private clearToken() {
    this.token = null;
    localStorage.removeItem('platform_admin_token');
    delete this.client.defaults.headers.common['Authorization'];
  }

  // ── Authentication ───────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<{ admin: PlatformAdmin; token: string }> {
    const response: AxiosResponse<ApiResponse<{ admin: PlatformAdmin; token: string }>> =
      await this.client.post('/auth/login', { email, password });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Login failed');
    }

    const data = response.data.data!;
    this.token = data.token;
    localStorage.setItem('platform_admin_token', this.token);
    this.setAuthHeader(this.token);

    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch {
      // best-effort
    } finally {
      this.clearToken();
    }
  }

  async getMe(): Promise<{ admin: PlatformAdmin }> {
    const response: AxiosResponse<ApiResponse<{ admin: PlatformAdmin }>> =
      await this.client.get('/auth/me');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get admin info');
    }

    return response.data.data!;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to change password');
    }
  }

  // ── Organizations ────────────────────────────────────────────────────────
  async listOrganizations(params?: Record<string, any>): Promise<{ organizations: Organization[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<Organization[]>> =
      await this.client.get('/organizations', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list organizations');
    }

    return {
      organizations: response.data.data!,
      meta: response.data.meta || {},
    };
  }

  async getOrganization(id: string): Promise<Organization> {
    const response: AxiosResponse<ApiResponse<Organization>> =
      await this.client.get(`/organizations/${id}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get organization');
    }

    return response.data.data!;
  }

  async createOrganization(data: Record<string, any>): Promise<Organization> {
    const response: AxiosResponse<ApiResponse<Organization>> =
      await this.client.post('/organizations', data);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create organization');
    }

    return response.data.data!;
  }

  async updateOrgStatus(id: string, billing_status: string): Promise<Organization> {
    const response: AxiosResponse<ApiResponse<Organization>> =
      await this.client.put(`/organizations/${id}/status`, { billing_status });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update organization status');
    }

    return response.data.data!;
  }

  async getOrgStats(id: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get(`/organizations/${id}/stats`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get organization stats');
    }

    return response.data.data!;
  }

  // ── Developers ─────────────────────────────────────────────────────────
  async listDevelopers(params?: Record<string, any>): Promise<{ developers: DeveloperInfo[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<DeveloperInfo[]>> =
      await this.client.get('/developers', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list developers');
    }

    return {
      developers: response.data.data!,
      meta: response.data.meta || {},
    };
  }

  async getDeveloper(id: string): Promise<DeveloperInfo> {
    const response: AxiosResponse<ApiResponse<DeveloperInfo>> =
      await this.client.get(`/developers/${id}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get developer');
    }

    return response.data.data!;
  }

  async suspendDeveloper(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/developers/${id}/suspend`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to suspend developer');
    }
  }

  async unsuspendDeveloper(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/developers/${id}/unsuspend`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to unsuspend developer');
    }
  }

  // ── Email ────────────────────────────────────────────────────────────────
  async getEmailConfig(): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get('/email/config');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get email config');
    }

    return response.data.data!;
  }

  async updateEmailConfig(data: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.put('/email/config', data);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update email config');
    }

    return response.data.data!;
  }

  async getEmailPreview(template: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get(`/email/preview/${template}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get email preview');
    }

    return response.data.data!;
  }

  // ── Branding ─────────────────────────────────────────────────────────────
  async getBranding(): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get('/branding');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get branding');
    }

    return response.data.data!;
  }

  async uploadBrandingAsset(assetType: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/branding/${assetType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to upload branding asset');
    }

    return response.data.data!;
  }

  // ── Platform Admins ──────────────────────────────────────────────────────
  async listPlatformAdmins(): Promise<PlatformAdmin[]> {
    const response: AxiosResponse<ApiResponse<PlatformAdmin[]>> =
      await this.client.get('/auth/admins');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list platform admins');
    }

    return response.data.data!;
  }

  async createPlatformAdmin(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role?: string;
  }): Promise<PlatformAdmin> {
    const response: AxiosResponse<ApiResponse<PlatformAdmin>> =
      await this.client.post('/auth/admins', data);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create platform admin');
    }

    return response.data.data!;
  }

  async deletePlatformAdmin(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.delete(`/auth/admins/${id}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete platform admin');
    }
  }

  // ── Sessions ─────────────────────────────────────────────────────────────
  async getSessions(): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/sessions');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to load sessions');
    }

    return response.data.data!;
  }

  async revokeSession(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.delete(`/sessions/${id}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to revoke session');
    }
  }

  // ── Provider Metrics ──────────────────────────────────────────────────
  async getProviderMetrics(provider: string, days: number = 7): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get('/provider-metrics', { params: { provider, days } });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to load provider metrics');
    }

    return response.data.data!;
  }

  // ── Audit Logs ────────────────────────────────────────────────────────
  async getAuditLogs(params?: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get('/audit-logs', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get audit logs');
    }

    return response.data.data!;
  }

  async getAuditLogStats(params?: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get('/audit-logs/stats', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get audit log statistics');
    }

    return response.data.data!;
  }

  async exportAuditLogs(params?: Record<string, any>): Promise<Blob> {
    const response = await this.client.get('/audit-logs/export', {
      params,
      responseType: 'blob',
    });

    if (response.status !== 200) {
      throw new Error('Failed to export audit logs');
    }

    return response.data;
  }

  // ── Verification Thresholds (per-org) ─────────────────────────────────
  async listOrgThresholds(): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/thresholds');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list org thresholds');
    }

    return response.data.data!;
  }

  async getOrgThresholds(orgId: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get(`/thresholds/${orgId}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get org thresholds');
    }

    return response.data.data!;
  }

  async updateOrgThresholds(orgId: string, settings: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.put(`/thresholds/${orgId}`, settings);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update org thresholds');
    }

    return response.data.data!;
  }

  async resetOrgThresholds(orgId: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/thresholds/${orgId}/reset`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to reset org thresholds');
    }

    return response.data.data!;
  }

  async previewOrgThresholds(orgId: string, settings: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/thresholds/${orgId}/preview`, settings);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to preview thresholds');
    }

    return response.data.data!;
  }

  // ── Platform Notifications ──────────────────────────────────────────
  async listNotifications(params?: Record<string, any>): Promise<{ notifications: any[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/notifications', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list notifications');
    }

    return { notifications: response.data.data!, meta: response.data.meta || {} };
  }

  async getUnreadCount(): Promise<number> {
    const response: AxiosResponse<ApiResponse<{ count: number }>> =
      await this.client.get('/notifications/unread-count');

    if (!response.data.success) return 0;
    return response.data.data!.count;
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.client.post(`/notifications/${id}/read`);
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.client.post('/notifications/read-all');
  }

  // ── Notification Channels ─────────────────────────────────────────────
  async listNotificationChannels(): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/notifications/channels');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list channels');
    }

    return response.data.data!;
  }

  async createNotificationChannel(data: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post('/notifications/channels', data);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create channel');
    }

    return response.data.data!;
  }

  async updateNotificationChannel(id: string, data: Record<string, any>): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.put(`/notifications/channels/${id}`, data);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update channel');
    }

    return response.data.data!;
  }

  async deleteNotificationChannel(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.delete(`/notifications/channels/${id}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete channel');
    }
  }

  async testNotificationChannel(id: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/notifications/channels/${id}/test`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to test channel');
    }
  }

  async getChannelRules(channelId: string): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get(`/notifications/channels/${channelId}/rules`);

    if (!response.data.success) return [];
    return response.data.data!;
  }

  async updateChannelRules(channelId: string, rules: any[]): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.put(`/notifications/channels/${channelId}/rules`, { rules });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update rules');
    }

    return response.data.data!;
  }

  // ── Platform Config ─────────────────────────────────────────────────
  async listConfig(): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/config');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list config');
    }

    return response.data.data!;
  }

  async getConfigValue(key: string): Promise<{ key: string; value: string }> {
    const response: AxiosResponse<ApiResponse<{ key: string; value: string }>> =
      await this.client.get(`/config/${key}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get config value');
    }

    return response.data.data!;
  }

  async setConfigValue(key: string, data: Record<string, any>): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.put(`/config/${key}`, data);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to set config value');
    }
  }

  async deleteConfigKey(key: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.delete(`/config/${key}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete config key');
    }
  }

  async exportConfigEnv(includeSecrets: boolean = false): Promise<string> {
    const response = await this.client.get('/config/export/env', {
      params: { include_secrets: includeSecrets },
      responseType: 'text',
    });
    return response.data;
  }

  async exportConfigJson(includeSecrets: boolean = false): Promise<Record<string, string>> {
    const response: AxiosResponse<ApiResponse<Record<string, string>>> =
      await this.client.get('/config/export/json', { params: { include_secrets: includeSecrets } });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to export config');
    }

    return response.data.data!;
  }

  async importConfig(content: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const response: AxiosResponse<ApiResponse<{ imported: number; skipped: number; errors: string[] }>> =
      await this.client.post('/config/import', { content });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to import config');
    }

    return response.data.data!;
  }

  async seedConfigDefaults(): Promise<void> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post('/config/seed');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to seed config');
    }
  }

  async getConfigAudit(params?: Record<string, any>): Promise<{ audits: any[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/config/audit', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get config audit');
    }

    return { audits: response.data.data!, meta: response.data.meta || {} };
  }

  // ── Key Management (Approval Workflow) ──────────────────────────────

  async generateEncryptionKey(): Promise<{ key: string }> {
    const response: AxiosResponse<ApiResponse<{ key: string }>> =
      await this.client.get('/config/key/generate');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to generate key');
    }

    return response.data.data!;
  }

  async listKeyChangeRequests(params?: Record<string, any>): Promise<{ requests: any[]; meta: any }> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/config/key/requests', { params });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list key change requests');
    }

    return { requests: response.data.data!, meta: response.data.meta || {} };
  }

  async createKeyChangeRequest(scenario: string, reason: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post('/config/key/request', { scenario, reason });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create key change request');
    }

    return response.data.data!;
  }

  async getKeyChangeRequest(id: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get(`/config/key/requests/${id}`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get key change request');
    }

    return response.data.data!;
  }

  async approveKeyChangeRequest(id: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/config/key/requests/${id}/approve`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to approve key change request');
    }

    return response.data.data!;
  }

  async denyKeyChangeRequest(id: string, reason?: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/config/key/requests/${id}/deny`, { reason });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to deny key change request');
    }

    return response.data.data!;
  }

  async cancelKeyChangeRequest(id: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/config/key/requests/${id}/cancel`);

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to cancel key change request');
    }

    return response.data.data!;
  }

  async executeKeyChangeRequest(id: string, newKey?: string): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.post(`/config/key/requests/${id}/execute`, { new_key: newKey });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to execute key change request');
    }

    return response.data.data!;
  }

  // ── System Status ─────────────────────────────────────────────────────
  async getSystemStatus(): Promise<any> {
    const response: AxiosResponse<ApiResponse> =
      await this.client.get('/status');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get system status');
    }

    return response.data.data!;
  }

  async getStatusHistory(): Promise<any[]> {
    const response: AxiosResponse<ApiResponse<any[]>> =
      await this.client.get('/status/history');

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get status history');
    }

    return response.data.data!;
  }

  // ── Utility ──────────────────────────────────────────────────────────────
  isAuthenticated(): boolean {
    return !!this.token;
  }

  getToken(): string | null {
    return this.token;
  }

  // ── Generic HTTP methods ─────────────────────────────────────────────────
  async get(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.get(url, config);
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.post(url, data, config);
  }

  async put(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.put(url, data, config);
  }

  async delete(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.client.delete(url, config);
  }
}

export const platformApi = new PlatformApiClient();
export default platformApi;
