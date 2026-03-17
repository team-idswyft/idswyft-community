import crypto from 'crypto';
import { vaasSupabase } from '../config/database.js';
import { idswyftApiService } from './idswyftApiService.js';
import { webhookService } from './webhookService.js';
import { emailService } from './emailService.js';
import { notificationService } from './notificationService.js';
import {
  VaasEndUser,
  VaasVerificationSession,
  VaasStartVerificationRequest,
  VaasStartVerificationResponse
} from '../types/index.js';

export class VerificationService {
  
  async startVerification(organizationId: string, request: VaasStartVerificationRequest): Promise<VaasStartVerificationResponse> {
    try {
      // Create or get end user
      let endUser = await this.getOrCreateEndUser(organizationId, request.end_user);

      // Create user in main Idswyft API (best-effort — VaaS flow can proceed without it)
      let idswyftUserId: string | null = null;
      let idswyftVerificationId: string | null = null;
      try {
        const idswyftUser = await idswyftApiService.createUser(
          idswyftApiService.mapVaasUserToIdswyftUser(endUser)
        );
        idswyftUserId = idswyftUser.id;

        // Create verification record in main API
        const idswyftVerification = await idswyftApiService.startVerification({
          user_id: idswyftUser.id,
          organization_id: organizationId,
        });
        idswyftVerificationId = idswyftVerification.verification_id;
      } catch (mainApiError: any) {
        console.warn('[VerificationService] Main API integration failed (non-blocking):', mainApiError.message);
        // Continue — VaaS sessions work independently of the main API
      }

      // Generate session token and expiry locally
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Create VaaS verification session
      const { data: session, error } = await vaasSupabase
        .from('vaas_verification_sessions')
        .insert({
          organization_id: organizationId,
          end_user_id: endUser.id,
          idswyft_verification_id: idswyftVerificationId,
          idswyft_user_id: idswyftUserId,
          status: 'pending',
          session_token: sessionToken,
          expires_at: expiresAt.toISOString(),
          issuing_country: request.issuing_country?.toUpperCase() || null,
          results: {}
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create verification session: ${error.message}`);
      }

      // Update end user status
      await vaasSupabase
        .from('vaas_end_users')
        .update({ verification_status: 'in_progress' })
        .eq('id', endUser.id);

      // Send webhook notification (fire-and-forget)
      webhookService.sendWebhook(organizationId, 'verification.started', {
        verification_session: session,
        end_user: endUser
      }).catch(err => console.error('[VerificationService] Webhook failed:', err.message));

      // Generate VaaS customer portal URL
      const customerPortalUrl = process.env.VAAS_CUSTOMER_PORTAL_URL || 'https://customer.idswyft.app';
      const vaasVerificationUrl = `${customerPortalUrl}/verify/${sessionToken}`;

      // Send verification invitation email (fire-and-forget)
      this.sendVerificationEmail(organizationId, endUser, vaasVerificationUrl, expiresAt)
        .catch(err => console.error('[VerificationService] Email send failed:', err.message));

      return {
        session_id: session.id,
        verification_url: vaasVerificationUrl,
        end_user: endUser,
        expires_at: expiresAt.toISOString(),
        session_token: sessionToken
      };
    } catch (error: any) {
      console.error('[VerificationService] Start verification failed:', error);
      throw error;
    }
  }
  
  async getVerification(organizationId: string, sessionId: string): Promise<VaasVerificationSession | null> {
    const { data: session, error } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select(`
        *,
        vaas_end_users!inner(*)
      `)
      .eq('id', sessionId)
      .eq('organization_id', organizationId)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get verification: ${error.message}`);
    }
    
    return session;
  }
  
  async listVerifications(organizationId: string, params: {
    status?: string;
    user_id?: string;
    page?: number;
    per_page?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    verifications: VaasVerificationSession[];
    total: number;
  }> {
    const page = params.page || 1;
    const perPage = Math.min(params.per_page || 20, 100);
    const offset = (page - 1) * perPage;
    
    let query = vaasSupabase
      .from('vaas_verification_sessions')
      .select(`
        *,
        vaas_end_users!inner(*)
      `, { count: 'exact' })
      .eq('organization_id', organizationId);
    
    if (params.status) {
      query = query.eq('status', params.status);
    }
    
    if (params.user_id) {
      query = query.eq('end_user_id', params.user_id);
    }
    
    if (params.start_date) {
      query = query.gte('created_at', params.start_date);
    }
    
    if (params.end_date) {
      query = query.lte('created_at', params.end_date);
    }
    
    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);
      
    if (error) {
      throw new Error(`Failed to list verifications: ${error.message}`);
    }
    
    return {
      verifications: data || [],
      total: count || 0
    };
  }
  
  async syncVerificationFromIdswyft(verificationId: string): Promise<VaasVerificationSession | null> {
    try {
      // Get VaaS session
      const { data: session, error: sessionError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .select('*')
        .eq('idswyft_verification_id', verificationId)
        .single();
        
      if (sessionError || !session) {
        console.error('[VerificationService] VaaS session not found for verification:', verificationId);
        return null;
      }
      
      // Get latest data from main Idswyft API
      const idswyftVerification = await idswyftApiService.getVerification(verificationId);
      
      // Map status
      const newStatus = idswyftApiService.mapVerificationStatus(idswyftVerification.status);
      
      // Update VaaS session
      const { data: updatedSession, error: updateError } = await vaasSupabase
        .from('vaas_verification_sessions')
        .update({
          status: newStatus,
          results: {
            verification_status: idswyftVerification.status,
            confidence_score: idswyftVerification.confidence_score,
            face_match_score: idswyftVerification.face_match_score,
            liveness_score: idswyftVerification.liveness_score,
            cross_validation_score: idswyftVerification.cross_validation_score,
            documents: idswyftVerification.documents,
            liveness_analysis: idswyftVerification.liveness_analysis,
            face_analysis: idswyftVerification.face_analysis,
            failure_reasons: idswyftVerification.failure_reasons
          },
          confidence_score: idswyftVerification.confidence_score,
          completed_at: idswyftVerification.completed_at || (newStatus === 'completed' || newStatus === 'verified' ? new Date().toISOString() : null)
        })
        .eq('id', session.id)
        .select()
        .single();
        
      if (updateError) {
        throw new Error(`Failed to update session: ${updateError.message}`);
      }
      
      // Update end user status
      let endUserStatus: VaasEndUser['verification_status'] = 'in_progress';
      
      switch (newStatus) {
        case 'completed':
          endUserStatus = idswyftVerification.confidence_score && idswyftVerification.confidence_score >= 0.8 ? 'verified' : 'manual_review';
          break;
        case 'verified':
          endUserStatus = 'verified'; // Direct mapping for verified status
          break;
        case 'failed':
          endUserStatus = 'failed';
          break;
        case 'expired':
          endUserStatus = 'expired';
          break;
        case 'manual_review':
          endUserStatus = 'manual_review';
          break;
        default:
          endUserStatus = 'in_progress';
      }
      
      await vaasSupabase
        .from('vaas_end_users')
        .update({ 
          verification_status: endUserStatus,
          verification_completed_at: (newStatus === 'completed' || newStatus === 'verified') ? new Date().toISOString() : null
        })
        .eq('id', session.end_user_id);
      
      // Send webhook notifications
      if (newStatus === 'completed' || newStatus === 'verified') {
        await webhookService.sendWebhook(session.organization_id, 'verification.completed', {
          verification_session: updatedSession,
          verification_results: updatedSession.results
        });
        notificationService.create({
          organizationId: session.organization_id,
          type: 'verification.completed',
          title: 'Verification Completed',
          message: `Verification ${session.id.slice(0, 8)} completed successfully.`,
          metadata: { session_id: session.id, end_user_id: session.end_user_id },
        }).catch(() => {});
      } else if (newStatus === 'failed') {
        await webhookService.sendWebhook(session.organization_id, 'verification.failed', {
          verification_session: updatedSession,
          failure_reasons: idswyftVerification.failure_reasons
        });
        notificationService.create({
          organizationId: session.organization_id,
          type: 'verification.failed',
          title: 'Verification Failed',
          message: `Verification ${session.id.slice(0, 8)} failed.`,
          metadata: { session_id: session.id, end_user_id: session.end_user_id },
        }).catch(() => {});
      } else if (endUserStatus === 'manual_review') {
        await webhookService.sendWebhook(session.organization_id, 'verification.manual_review', {
          verification_session: updatedSession,
          review_reason: 'Low confidence score'
        });
        notificationService.create({
          organizationId: session.organization_id,
          type: 'verification.manual_review',
          title: 'Manual Review Required',
          message: `Verification ${session.id.slice(0, 8)} requires manual review.`,
          metadata: { session_id: session.id, end_user_id: session.end_user_id },
        }).catch(() => {});
      }

      return updatedSession;
    } catch (error: any) {
      console.error('[VerificationService] Sync verification failed:', error);
      throw error;
    }
  }
  
  async approveVerification(organizationId: string, sessionId: string, reviewerId: string, notes?: string): Promise<VaasVerificationSession> {
    const session = await this.getVerification(organizationId, sessionId);
    if (!session) {
      throw new Error('Verification session not found');
    }
    
    // Approve in main Idswyft API (best-effort — VaaS sessions work independently)
    if (session.idswyft_verification_id) {
      try {
        await idswyftApiService.approveVerification(session.idswyft_verification_id, notes);
      } catch (err: any) {
        console.warn('[VerificationService] Main API approve failed (non-blocking):', err.message);
      }
    }

    // Update VaaS session
    const { data: updatedSession, error } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({
        status: 'completed',
        results: {
          ...session.results,
          manual_review_reason: 'Manually approved',
          reviewer_id: reviewerId,
          reviewed_at: new Date().toISOString(),
          review_notes: notes
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();
      
    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }
    
    // Update end user
    await vaasSupabase
      .from('vaas_end_users')
      .update({ 
        verification_status: 'verified',
        verification_completed_at: new Date().toISOString()
      })
      .eq('id', session.end_user_id);
    
    // Send webhook
    await webhookService.sendWebhook(organizationId, 'verification.approved', {
      verification_session: updatedSession,
      reviewer_id: reviewerId,
      review_notes: notes
    });
    
    return updatedSession;
  }
  
  async rejectVerification(organizationId: string, sessionId: string, reviewerId: string, reason: string, notes?: string): Promise<VaasVerificationSession> {
    const session = await this.getVerification(organizationId, sessionId);
    if (!session) {
      throw new Error('Verification session not found');
    }
    
    // Reject in main Idswyft API (best-effort — VaaS sessions work independently)
    if (session.idswyft_verification_id) {
      try {
        await idswyftApiService.rejectVerification(session.idswyft_verification_id, reason, notes);
      } catch (err: any) {
        console.warn('[VerificationService] Main API reject failed (non-blocking):', err.message);
      }
    }

    // Update VaaS session
    const { data: updatedSession, error } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({
        status: 'failed',
        results: {
          ...session.results,
          manual_review_reason: reason,
          reviewer_id: reviewerId,
          reviewed_at: new Date().toISOString(),
          review_notes: notes
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();
      
    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }
    
    // Update end user
    await vaasSupabase
      .from('vaas_end_users')
      .update({ 
        verification_status: 'failed',
        verification_completed_at: new Date().toISOString()
      })
      .eq('id', session.end_user_id);
    
    // Send webhook
    await webhookService.sendWebhook(organizationId, 'verification.rejected', {
      verification_session: updatedSession,
      reviewer_id: reviewerId,
      rejection_reason: reason,
      review_notes: notes
    });
    
    return updatedSession;
  }
  
  async overrideVerification(
    organizationId: string,
    sessionId: string,
    reviewerId: string,
    reason: string,
    notes?: string
  ): Promise<VaasVerificationSession> {
    const session = await this.getVerification(organizationId, sessionId);
    if (!session) {
      throw new Error('Verification session not found');
    }

    const terminalStatuses = ['failed', 'verified', 'completed', 'terminated'];
    if (!terminalStatuses.includes(session.status)) {
      throw new Error(`Cannot override verification in '${session.status}' status. Only terminal states can be overridden.`);
    }

    const previousStatus = session.status;

    // Update VaaS session to manual_review with override metadata
    const { data: updatedSession, error } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({
        status: 'manual_review',
        results: {
          ...session.results,
          override_reason: reason,
          override_by: reviewerId,
          override_at: new Date().toISOString(),
          override_from_status: previousStatus,
          override_notes: notes || null
        }
      })
      .eq('id', sessionId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to override verification: ${error.message}`);
    }

    // Update end user status
    await vaasSupabase
      .from('vaas_end_users')
      .update({ verification_status: 'manual_review' })
      .eq('id', session.end_user_id);

    // Send webhook (fire-and-forget)
    webhookService.sendWebhook(organizationId, 'verification.overridden', {
      verification_session: updatedSession,
      override_reason: reason,
      override_notes: notes,
      previous_status: previousStatus,
      reviewer_id: reviewerId
    }).catch(err => console.error('[VerificationService] Override webhook failed:', err.message));

    notificationService.create({
      organizationId,
      type: 'verification.overridden',
      title: 'Verification Overridden',
      message: `Verification ${sessionId.slice(0, 8)} was overridden from ${previousStatus} to manual_review.`,
      metadata: { session_id: sessionId, previous_status: previousStatus, reviewer_id: reviewerId },
    }).catch(() => {});

    return updatedSession;
  }

  private async sendVerificationEmail(
    organizationId: string,
    endUser: VaasEndUser,
    verificationUrl: string,
    expiresAt: Date
  ): Promise<void> {
    if (!endUser.email) return;

    // Fetch organization for branding
    const { data: organization } = await vaasSupabase
      .from('vaas_organizations')
      .select('name, branding')
      .eq('id', organizationId)
      .single();

    const orgName = organization?.name || 'Idswyft';
    const userName = [endUser.first_name, endUser.last_name].filter(Boolean).join(' ') || 'there';

    await emailService.sendVerificationInvitation({
      userEmail: endUser.email,
      userName,
      organizationName: orgName,
      verificationUrl,
      expiresAt: expiresAt.toISOString(),
      organizationBranding: organization?.branding ? {
        primary_color: organization.branding.primary_color,
        logo_url: organization.branding.logo_url,
        company_name: organization.branding.company_name || orgName,
        welcome_message: organization.branding.welcome_message
      } : undefined
    });

    console.log('[VerificationService] Verification invitation email sent to:', endUser.email);
  }

  private async getOrCreateEndUser(organizationId: string, userData: VaasStartVerificationRequest['end_user']): Promise<VaasEndUser> {
    // Try to find existing user by external_id or email
    let existingUser = null;
    
    if (userData.external_id) {
      const { data } = await vaasSupabase
        .from('vaas_end_users')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('external_id', userData.external_id)
        .single();
      existingUser = data;
    }
    
    if (!existingUser && userData.email) {
      const { data } = await vaasSupabase
        .from('vaas_end_users')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('email', userData.email)
        .single();
      existingUser = data;
    }
    
    if (existingUser) {
      // Update existing user with new data
      const { data: updatedUser, error } = await vaasSupabase
        .from('vaas_end_users')
        .update({
          email: userData.email || existingUser.email,
          phone: userData.phone || existingUser.phone,
          first_name: userData.first_name || existingUser.first_name,
          last_name: userData.last_name || existingUser.last_name,
          metadata: { ...existingUser.metadata, ...userData.metadata },
          verification_status: 'pending'
        })
        .eq('id', existingUser.id)
        .select()
        .single();
        
      if (error) {
        throw new Error(`Failed to update end user: ${error.message}`);
      }
      
      return updatedUser;
    } else {
      // Create new user
      const { data: newUser, error } = await vaasSupabase
        .from('vaas_end_users')
        .insert({
          organization_id: organizationId,
          email: userData.email,
          phone: userData.phone,
          first_name: userData.first_name,
          last_name: userData.last_name,
          external_id: userData.external_id,
          metadata: userData.metadata || {},
          tags: [],
          verification_status: 'pending'
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create end user: ${error.message}`);
      }

      const userName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || userData.email || 'Unknown';
      notificationService.create({
        organizationId,
        type: 'user.created',
        title: 'New User Created',
        message: `End user ${userName} was added to the system.`,
        metadata: { user_id: newUser.id, email: userData.email },
      }).catch(() => {});

      return newUser;
    }
  }
}

export const verificationService = new VerificationService();