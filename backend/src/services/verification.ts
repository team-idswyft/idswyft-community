import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import {
  VerificationRequest,
  Document,
  Selfie,
  OCRData,
  VerificationStatus,
  VerificationSource
} from '@/types/index.js';
import { DocumentQualityService, DocumentQualityResult } from './documentQuality.js';
import config from '@/config/index.js';

export class VerificationService {
  async createVerificationRequest(data: {
    user_id: string;
    developer_id: string;
    is_sandbox?: boolean;
    source?: VerificationSource;
  }): Promise<VerificationRequest> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .insert({
        user_id: data.user_id,
        developer_id: data.developer_id,
        status: 'pending',
        is_sandbox: data.is_sandbox ?? false,
        source: data.source ?? 'api',
      })
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to create verification request:', error);
      throw new Error('Failed to create verification request');
    }
    
    return verification as VerificationRequest;
  }
  
  async getVerificationRequest(id: string): Promise<VerificationRequest | null> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get verification request:', error);
      throw new Error('Failed to get verification request');
    }

    return verification as VerificationRequest;
  }

  async deleteVerificationRequest(id: string): Promise<void> {
    await supabase.from('verification_requests').delete().eq('id', id);
  }

  /**
   * Like getVerificationRequest but scoped to a specific developer.
   * Returns null if the verification exists but belongs to a different developer.
   * Use this on all developer-authenticated endpoints to prevent IDOR attacks.
   */
  async getVerificationRequestForDeveloper(
    id: string,
    developerId: string
  ): Promise<VerificationRequest | null> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('id', id)
      .eq('developer_id', developerId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found or belongs to a different developer
      }
      logger.error('Failed to get scoped verification request:', error);
      throw new Error('Failed to get verification request');
    }

    return verification as VerificationRequest;
  }
  
  async updateVerificationRequest(
    id: string, 
    updates: Partial<VerificationRequest>
  ): Promise<VerificationRequest> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to update verification request:', error);
      throw new Error('Failed to update verification request');
    }
    
    return verification as VerificationRequest;
  }
  
  async getLatestVerificationByUserId(userId: string): Promise<VerificationRequest | null> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get latest verification:', error);
      throw new Error('Failed to get latest verification');
    }
    
    return verification as VerificationRequest;
  }
  
  async getVerificationHistory(
    userId: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{ verifications: VerificationRequest[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const { data: verifications, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    const { count, error: countError } = await supabase
      .from('verification_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (error || countError) {
      logger.error('Failed to get verification history:', error || countError);
      throw new Error('Failed to get verification history');
    }
    
    return {
      verifications: verifications as VerificationRequest[],
      total: count || 0
    };
  }
  
  async createDocument(data: {
    verification_request_id: string;
    file_path: string;
    file_name: string;
    file_size: number;
    mime_type: string;
    document_type: string;
    is_back_of_id?: boolean;
  }): Promise<Document> {
    const { data: document, error } = await supabase
      .from('documents')
      .insert(data)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to create document:', error);
      throw new Error('Failed to create document');
    }
    
    return document as Document;
  }
  
  async getDocumentByVerificationId(verificationId: string): Promise<Document | null> {
    // First try to get the front document (main document, not back-of-id)
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('verification_request_id', verificationId)
      .order('created_at', { ascending: true }); // Get the first uploaded document (front)
    
    if (error) {
      logger.error('Failed to get documents:', error);
      throw new Error('Failed to get documents');
    }
    
    if (!documents || documents.length === 0) {
      console.log('❌ No documents found for verification_id:', verificationId);
      return null;
    }
    
    // Return the first document (should be the front document)
    const frontDocument = documents[0] as Document;
    console.log('✅ Found front document:', {
      id: frontDocument.id,
      verification_request_id: frontDocument.verification_request_id,
      file_name: frontDocument.file_name,
      created_at: frontDocument.created_at
    });
    
    return frontDocument;
  }

  
  async updateDocument(
    id: string, 
    updates: Partial<Document>
  ): Promise<Document> {
    const { data: document, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to update document:', error);
      throw new Error('Failed to update document');
    }
    
    return document as Document;
  }
  
  async analyzeDocumentQuality(filePath: string): Promise<DocumentQualityResult> {
    try {
      logger.info('Starting document quality analysis', { filePath });
      const qualityResult = await DocumentQualityService.analyzeDocument(filePath);
      logger.info('Document quality analysis completed', { 
        filePath, 
        overallQuality: qualityResult.overallQuality,
        issues: qualityResult.issues.length 
      });
      return qualityResult;
    } catch (error) {
      logger.error('Document quality analysis failed:', error);
      throw new Error('Failed to analyze document quality');
    }
  }
  
  async createSelfie(data: {
    verification_request_id: string;
    file_path: string;
    file_name: string;
    file_size: number;
    liveness_score?: number;
  }): Promise<Selfie> {
    const { data: selfie, error } = await supabase
      .from('selfies')
      .insert({
        verification_request_id: data.verification_request_id,
        file_path: data.file_path,
        file_name: data.file_name,
        file_size: data.file_size,
        liveness_score: data.liveness_score,
        face_detected: false // Will be updated by face recognition service
      })
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to create selfie:', error);
      throw new Error('Failed to create selfie');
    }
    
    return selfie as Selfie;
  }
  
  async updateSelfie(
    id: string, 
    updates: Partial<Selfie>
  ): Promise<Selfie> {
    const { data: selfie, error } = await supabase
      .from('selfies')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to update selfie:', error);
      throw new Error('Failed to update selfie');
    }
    
    return selfie as Selfie;
  }
  
  // Admin methods
  async getVerificationRequestsForAdmin(
    filters: {
      status?: VerificationStatus;
      developerId?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ verifications: VerificationRequest[]; total: number }> {
    const { status, developerId, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = supabase
      .from('verification_requests')
      .select(`
        *,
        user:users(*),
        developer:developers(*),
        document:documents(*),
        selfie:selfies(*)
      `);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (developerId) {
      query = query.eq('developer_id', developerId);
    }
    
    const { data: verifications, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Get total count
    let countQuery = supabase
      .from('verification_requests')
      .select('*', { count: 'exact', head: true });
    
    if (status) {
      countQuery = countQuery.eq('status', status);
    }
    
    if (developerId) {
      countQuery = countQuery.eq('developer_id', developerId);
    }
    
    const { count, error: countError } = await countQuery;
    
    if (error || countError) {
      logger.error('Failed to get verification requests for admin:', error || countError);
      throw new Error('Failed to get verification requests');
    }
    
    return {
      verifications: verifications as VerificationRequest[],
      total: count || 0
    };
  }
  
  async approveVerification(
    verificationId: string, 
    adminUserId: string
  ): Promise<VerificationRequest> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .update({
        status: 'verified',
        manual_review_reason: `Manually approved by admin ${adminUserId}`
      })
      .eq('id', verificationId)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to approve verification:', error);
      throw new Error('Failed to approve verification');
    }
    
    logger.info('Verification manually approved', {
      verificationId,
      adminUserId
    });
    
    return verification as VerificationRequest;
  }
  
  async rejectVerification(
    verificationId: string, 
    adminUserId: string, 
    reason: string
  ): Promise<VerificationRequest> {
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .update({
        status: 'failed',
        manual_review_reason: `Manually rejected by admin ${adminUserId}: ${reason}`
      })
      .eq('id', verificationId)
      .select('*')
      .single();
    
    if (error) {
      logger.error('Failed to reject verification:', error);
      throw new Error('Failed to reject verification');
    }
    
    logger.info('Verification manually rejected', {
      verificationId,
      adminUserId,
      reason
    });
    
    return verification as VerificationRequest;
  }
  
  // Analytics methods
  async getVerificationStats(developerId?: string): Promise<{
    total: number;
    verified: number;
    failed: number;
    pending: number;
    manual_review: number;
  }> {
    let query = supabase
      .from('verification_requests')
      .select('status');
    
    if (developerId) {
      query = query.eq('developer_id', developerId);
    }
    
    const { data: verifications, error } = await query;
    
    if (error) {
      logger.error('Failed to get verification stats:', error);
      throw new Error('Failed to get verification stats');
    }
    
    const stats = {
      total: verifications.length,
      verified: 0,
      failed: 0,
      pending: 0,
      manual_review: 0
    };
    
    verifications.forEach(v => {
      stats[v.status as keyof typeof stats]++;
    });

    return stats;
  }

  /**
   * Escalates a borderline or failed verification to a paid external provider
   * (Persona or Onfido) when self-hosted confidence is too low.
   */
  async handleFallbackVerification(verificationId: string, userId: string): Promise<void> {
    if (config.externalApis.persona?.apiKey) {
      const { PersonaProvider } = await import('@/providers/fallback/PersonaProvider.js');
      const persona = new PersonaProvider();
      const { inquiryId } = await persona.createInquiry(userId);

      await this.updateVerificationRequest(verificationId, {
        status: 'manual_review' as VerificationStatus,
        manual_review_reason: `Escalated to Persona: inquiry ${inquiryId}`,
      });

      logger.info('Verification escalated to Persona', { verificationId, userId, inquiryId });
    } else if (config.externalApis.onfido?.apiKey) {
      const { OnfidoProvider } = await import('@/providers/fallback/OnfidoProvider.js');
      const onfido = new OnfidoProvider();
      const { applicantId } = await onfido.createApplicant(userId, 'Unknown', 'Unknown');

      await this.updateVerificationRequest(verificationId, {
        status: 'manual_review' as VerificationStatus,
        manual_review_reason: `Escalated to Onfido: applicant ${applicantId}`,
      });

      logger.info('Verification escalated to Onfido', { verificationId, userId, applicantId });
    } else {
      logger.warn('No external fallback provider configured; keeping manual_review status', {
        verificationId,
        userId,
      });
    }
  }
}
