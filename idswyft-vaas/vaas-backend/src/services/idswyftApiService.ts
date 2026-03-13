import axios, { AxiosInstance, AxiosResponse } from 'axios';
import config from '../config/index.js';
import { VaasEndUser, VaasVerificationSession } from '../types/index.js';

interface IdswyftApiUser {
  id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  metadata?: Record<string, any>;
}

interface IdswyftApiVerification {
  id: string;
  user_id: string;
  status: string;
  confidence_score?: number;
  face_match_score?: number;
  liveness_score?: number;
  cross_validation_score?: number;
  documents?: any[];
  liveness_analysis?: any;
  face_analysis?: any;
  failure_reasons?: string[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface IdswyftStartVerificationRequest {
  user_id: string;
  organization_id?: string;
  require_liveness?: boolean;
  require_back_of_id?: boolean;
  webhook_url?: string;
  success_redirect_url?: string;
  failure_redirect_url?: string;
  metadata?: Record<string, any>;
}

interface IdswyftStartVerificationResponse {
  verification_id: string;
  status: string;
}

export class IdswyftApiService {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: config.idswyftApi.baseUrl,
      timeout: config.idswyftApi.timeout,
      headers: {
        'X-Service-Token': config.idswyftApi.serviceToken,
        'Content-Type': 'application/json',
        'User-Agent': 'VaaS-Service/1.0.0'
      }
    });
    
    // Add request/response interceptors for logging and error handling
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[IdswyftAPI] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[IdswyftAPI] Request error:', error);
        return Promise.reject(error);
      }
    );
    
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[IdswyftAPI] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error(`[IdswyftAPI] ${error.response?.status || 'NETWORK'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
        console.error('[IdswyftAPI] Error details:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }
  
  async createUser(userData: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    external_id?: string;
    metadata?: Record<string, any>;
  }): Promise<IdswyftApiUser> {
    try {
      const response: AxiosResponse<{ success: boolean; data: IdswyftApiUser }> = await this.client.post('/api/vaas/users', {
        email: userData.email,
        phone: userData.phone,
        first_name: userData.first_name,
        last_name: userData.last_name,
        external_id: userData.external_id,
        metadata: {
          ...userData.metadata,
          source: 'vaas',
          created_via_vaas: true
        }
      });
      
      if (!response.data.success) {
        throw new Error('Failed to create user in main Idswyft API');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] Create user failed:', error.response?.data || error.message);
      throw new Error(`Failed to create user: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async startVerification(request: IdswyftStartVerificationRequest): Promise<IdswyftStartVerificationResponse> {
    try {
      // Uses /api/vaas/verify which accepts service token auth
      const response = await this.client.post('/api/vaas/verify', {
        user_id: request.user_id,
        organization_id: request.organization_id,
      });

      if (!response.data.success) {
        throw new Error('Failed to start verification in main Idswyft API');
      }

      return {
        verification_id: response.data.verification_id,
        status: response.data.status,
      };
    } catch (error: any) {
      console.error('[IdswyftAPI] Start verification failed:', error.response?.data || error.message);
      throw new Error(`Failed to start verification: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async getVerification(verificationId: string): Promise<IdswyftApiVerification> {
    try {
      const response = await this.client.get(`/api/vaas/verify/${verificationId}/status`);

      if (!response.data.success) {
        throw new Error('Failed to get verification from main Idswyft API');
      }

      const v = response.data.verification;
      return {
        id: v.id,
        user_id: '',
        status: v.status,
        confidence_score: v.confidence_score,
        failure_reasons: v.failure_reason ? [v.failure_reason] : undefined,
        created_at: '',
        updated_at: v.updated_at,
      };
    } catch (error: any) {
      console.error('[IdswyftAPI] Get verification failed:', error.response?.data || error.message);
      throw new Error(`Failed to get verification: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async listVerifications(params: {
    user_id?: string;
    status?: string;
    page?: number;
    per_page?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    verifications: IdswyftApiVerification[];
    total: number;
    page: number;
    per_page: number;
    has_more: boolean;
  }> {
    try {
      const response = await this.client.get('/api/verifications', { params });
      
      if (!response.data.success) {
        throw new Error('Failed to list verifications from main Idswyft API');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] List verifications failed:', error.response?.data || error.message);
      throw new Error(`Failed to list verifications: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async getUser(userId: string): Promise<IdswyftApiUser> {
    try {
      const response: AxiosResponse<{ success: boolean; data: IdswyftApiUser }> = await this.client.get(`/api/users/${userId}`);
      
      if (!response.data.success) {
        throw new Error('Failed to get user from main Idswyft API');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] Get user failed:', error.response?.data || error.message);
      throw new Error(`Failed to get user: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async updateUser(userId: string, updates: Partial<IdswyftApiUser>): Promise<IdswyftApiUser> {
    try {
      const response: AxiosResponse<{ success: boolean; data: IdswyftApiUser }> = await this.client.put(`/api/users/${userId}`, updates);
      
      if (!response.data.success) {
        throw new Error('Failed to update user in main Idswyft API');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] Update user failed:', error.response?.data || error.message);
      throw new Error(`Failed to update user: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async deleteUser(userId: string): Promise<void> {
    try {
      const response = await this.client.delete(`/api/users/${userId}`);
      
      if (!response.data.success) {
        throw new Error('Failed to delete user from main Idswyft API');
      }
    } catch (error: any) {
      console.error('[IdswyftAPI] Delete user failed:', error.response?.data || error.message);
      throw new Error(`Failed to delete user: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async approveVerification(verificationId: string, reviewNotes?: string): Promise<IdswyftApiVerification> {
    try {
      const response: AxiosResponse<{ success: boolean; data: IdswyftApiVerification }> = await this.client.post(`/api/verifications/${verificationId}/approve`, {
        review_notes: reviewNotes
      });
      
      if (!response.data.success) {
        throw new Error('Failed to approve verification in main Idswyft API');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] Approve verification failed:', error.response?.data || error.message);
      throw new Error(`Failed to approve verification: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async rejectVerification(verificationId: string, reason: string, reviewNotes?: string): Promise<IdswyftApiVerification> {
    try {
      const response: AxiosResponse<{ success: boolean; data: IdswyftApiVerification }> = await this.client.post(`/api/verifications/${verificationId}/reject`, {
        rejection_reason: reason,
        review_notes: reviewNotes
      });
      
      if (!response.data.success) {
        throw new Error('Failed to reject verification in main Idswyft API');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] Reject verification failed:', error.response?.data || error.message);
      throw new Error(`Failed to reject verification: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  async getApiHealth(): Promise<{ status: string; version: string; timestamp: string }> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error: any) {
      console.error('[IdswyftAPI] Health check failed:', error.message);
      throw new Error('Main Idswyft API is unavailable');
    }
  }
  
  // Webhook signature verification
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
  
  // Helper method to map Idswyft API status to VaaS status
  mapVerificationStatus(idswyftStatus: string): VaasVerificationSession['status'] {
    switch (idswyftStatus.toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'document_uploaded':
        return 'document_uploaded';
      case 'processing':
        return 'processing';
      case 'completed':
        return 'completed'; // Legacy support
      case 'verified':
        return 'verified'; // Map verified status correctly for admin dashboard
      case 'failed':
        return 'failed';
      case 'expired':
        return 'expired';
      case 'manual_review':
        return 'manual_review';
      default:
        return 'pending';
    }
  }
  
  // Helper method to map VaaS user to Idswyft API format
  mapVaasUserToIdswyftUser(vaasUser: VaasEndUser): Partial<IdswyftApiUser> {
    return {
      email: vaasUser.email,
      phone: vaasUser.phone,
      first_name: vaasUser.first_name,
      last_name: vaasUser.last_name,
      metadata: {
        ...vaasUser.metadata,
        external_id: vaasUser.external_id,
        tags: vaasUser.tags,
        vaas_user_id: vaasUser.id,
        vaas_organization_id: vaasUser.organization_id
      }
    };
  }
}

export const idswyftApiService = new IdswyftApiService();