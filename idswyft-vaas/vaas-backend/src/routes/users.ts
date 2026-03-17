import { Router } from 'express';
import { requireAuth, requireApiKey, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { apiKeyRateLimit } from '../middleware/rateLimit.js';
import { VaasApiResponse, VaasEndUser } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';
import { emailService } from '../services/emailService.js';
import { v4 as uuidv4 } from 'uuid';
import { auditService } from '../services/auditService.js';

const router = Router();

// List end users (admin auth required)
router.get('/', requireAuth, requirePermission('view_users'), validatePagination, async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const page = parseInt(req.query.page as string) || 1;
    const per_page = Math.min(parseInt(req.query.per_page as string) || 20, 100);
    const offset = (page - 1) * per_page;
    
    // Build query with filters
    let query = vaasSupabase
      .from('vaas_end_users')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (req.query.status) {
      query = query.eq('verification_status', req.query.status as string);
    }
    
    if (req.query.email) {
      query = query.ilike('email', `%${req.query.email as string}%`);
    }
    
    if (req.query.external_id) {
      query = query.eq('external_id', req.query.external_id as string);
    }
    
    if (req.query.start_date) {
      query = query.gte('created_at', req.query.start_date as string);
    }
    
    if (req.query.end_date) {
      query = query.lte('created_at', req.query.end_date as string);
    }
    
    // Apply pagination
    const { data: users, error, count } = await query
      .range(offset, offset + per_page - 1);
    
    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: users || [],
      meta: {
        total: count || 0,
        page,
        per_page,
        has_more: (count || 0) > page * per_page
      }
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('[UserRoutes] List users failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LIST_USERS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Create new end user (admin auth or API key)
router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    let organizationId: string;
    
    // Check if using API key or admin auth
    if (req.headers['x-api-key']) {
      await new Promise<void>((resolve, reject) => {
        requireApiKey(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      // Per-API-key rate limiting
      if ((req as any).apiKey) {
        await new Promise<void>((resolve) => {
          apiKeyRateLimit(req, res, () => resolve());
        });
        if (res.headersSent) return;
      }

      organizationId = (req as any).apiKey.organization_id;

      // Check API key scopes
      if (!(req as any).apiKey.scopes.includes('write')) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Write permissions required'
          }
        };
        
        return res.status(403).json(response);
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      organizationId = req.admin!.organization_id;
      
      // Check admin permissions
      if (!req.admin!.permissions.manage_users && !req.admin!.permissions.view_users) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Permission to manage users required'
          }
        };
        
        return res.status(403).json(response);
      }
    }
    
    const {
      email,
      phone,
      first_name,
      last_name,
      external_id,
      metadata = {},
      tags = []
    } = req.body;
    
    // Validate required fields
    if (!email && !phone) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either email or phone number is required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email format'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Check for duplicate email in organization (case insensitive)
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const { data: existingUsers, error: duplicateError } = await vaasSupabase
        .from('vaas_end_users')
        .select('id, email')
        .eq('organization_id', organizationId)
        .ilike('email', normalizedEmail);
        
      if (duplicateError) {
        console.error('[UserRoutes] Error checking for duplicate email:', duplicateError);
        throw new Error(`Failed to check for duplicate email: ${duplicateError.message}`);
      }
      
      if (existingUsers && existingUsers.length > 0) {
        console.log('[UserRoutes] Found existing users with email:', existingUsers);
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'A user with this email already exists in your organization',
            details: {
              existing_users: existingUsers.map(u => ({ id: u.id, email: u.email }))
            }
          }
        };
        
        return res.status(409).json(response);
      }
    }
    
    // Check for duplicate external_id in organization
    if (external_id) {
      const { data: existingUsers, error: duplicateIdError } = await vaasSupabase
        .from('vaas_end_users')
        .select('id, external_id')
        .eq('organization_id', organizationId)
        .eq('external_id', external_id);
        
      if (duplicateIdError) {
        console.error('[UserRoutes] Error checking for duplicate external_id:', duplicateIdError);
        throw new Error(`Failed to check for duplicate external_id: ${duplicateIdError.message}`);
      }
        
      if (existingUsers && existingUsers.length > 0) {
        console.log('[UserRoutes] Found existing users with external_id:', existingUsers);
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_EXTERNAL_ID',
            message: 'A user with this external ID already exists in your organization',
            details: {
              existing_users: existingUsers.map(u => ({ id: u.id, external_id: u.external_id }))
            }
          }
        };
        
        return res.status(409).json(response);
      }
    }
    
    // Create the end user
    const newUser = {
      id: uuidv4(),
      organization_id: organizationId,
      email: email ? email.toLowerCase().trim() : null,
      phone: phone || null,
      first_name: first_name || null,
      last_name: last_name || null,
      external_id: external_id || null,
      metadata: metadata,
      tags: tags,
      verification_status: 'pending' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: createdUser, error } = await vaasSupabase
      .from('vaas_end_users')
      .insert(newUser)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
    
    console.log(`[UserRoutes] Created new end user:`, createdUser);
    
    const response: VaasApiResponse<VaasEndUser> = {
      success: true,
      data: createdUser
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    console.error('[UserRoutes] Create user failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'CREATE_USER_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Get user details (admin auth or API key)
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    let organizationId: string;
    
    // Check if using API key or admin auth
    if (req.headers['x-api-key']) {
      await new Promise<void>((resolve, reject) => {
        requireApiKey(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      // Per-API-key rate limiting
      if ((req as any).apiKey) {
        await new Promise<void>((resolve) => {
          apiKeyRateLimit(req, res, () => resolve());
        });
        if (res.headersSent) return;
      }

      organizationId = (req as any).apiKey.organization_id;

      // Check API key scopes
      if (!(req as any).apiKey.scopes.includes('read')) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Read permissions required'
          }
        };
        
        return res.status(403).json(response);
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      organizationId = req.admin!.organization_id;
      
      // Check admin permissions
      if (!req.admin!.permissions.view_users) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Permission to view users required'
          }
        };
        
        return res.status(403).json(response);
      }
    }
    
    const { data: user, error } = await vaasSupabase
      .from('vaas_end_users')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    if (error || !user) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const response: VaasApiResponse<VaasEndUser> = {
      success: true,
      data: user
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('[UserRoutes] Get user failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_USER_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Update end user (admin auth required)
router.put('/:id', requireAuth, requirePermission('manage_users'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    
    const {
      email,
      phone,
      first_name,
      last_name,
      external_id,
      metadata,
      tags,
      verification_status
    } = req.body;
    
    // Check if user exists and belongs to organization
    const { data: existingUser, error: fetchError } = await vaasSupabase
      .from('vaas_end_users')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    if (fetchError || !existingUser) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email format'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Check for duplicate email (excluding current user)
    if (email && email.toLowerCase().trim() !== (existingUser.email || '').toLowerCase().trim()) {
      const normalizedEmail = email.toLowerCase().trim();
      const { data: duplicateUsers, error: duplicateError } = await vaasSupabase
        .from('vaas_end_users')
        .select('id, email')
        .eq('organization_id', organizationId)
        .ilike('email', normalizedEmail)
        .neq('id', id);
        
      if (duplicateError) {
        console.error('[UserRoutes] Error checking for duplicate email in update:', duplicateError);
        throw new Error(`Failed to check for duplicate email: ${duplicateError.message}`);
      }
        
      if (duplicateUsers && duplicateUsers.length > 0) {
        console.log('[UserRoutes] Found existing users with email during update:', duplicateUsers);
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'A user with this email already exists in your organization',
            details: {
              existing_users: duplicateUsers.map(u => ({ id: u.id, email: u.email }))
            }
          }
        };
        
        return res.status(409).json(response);
      }
    }
    
    // Check for duplicate external_id (excluding current user)
    if (external_id && external_id !== existingUser.external_id) {
      const { data: duplicateUsers, error: duplicateIdError } = await vaasSupabase
        .from('vaas_end_users')
        .select('id, external_id')
        .eq('organization_id', organizationId)
        .eq('external_id', external_id)
        .neq('id', id);
        
      if (duplicateIdError) {
        console.error('[UserRoutes] Error checking for duplicate external_id in update:', duplicateIdError);
        throw new Error(`Failed to check for duplicate external_id: ${duplicateIdError.message}`);
      }
        
      if (duplicateUsers && duplicateUsers.length > 0) {
        console.log('[UserRoutes] Found existing users with external_id during update:', duplicateUsers);
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_EXTERNAL_ID',
            message: 'A user with this external ID already exists in your organization',
            details: {
              existing_users: duplicateUsers.map(u => ({ id: u.id, external_id: u.external_id }))
            }
          }
        };
        
        return res.status(409).json(response);
      }
    }
    
    // Prepare update data (only include defined fields)
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (email !== undefined) updateData.email = email ? email.toLowerCase().trim() : null;
    if (phone !== undefined) updateData.phone = phone;
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (external_id !== undefined) updateData.external_id = external_id;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (tags !== undefined) updateData.tags = tags;
    if (verification_status !== undefined) updateData.verification_status = verification_status;
    
    const { data: updatedUser, error } = await vaasSupabase
      .from('vaas_end_users')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
    
    console.log(`[UserRoutes] Updated end user:`, updatedUser);
    
    const response: VaasApiResponse<VaasEndUser> = {
      success: true,
      data: updatedUser
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('[UserRoutes] Update user failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'UPDATE_USER_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Delete end user (admin auth required)
router.delete('/:id', requireAuth, requirePermission('manage_users'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    
    // Check if user exists and belongs to organization
    const { data: existingUser, error: fetchError } = await vaasSupabase
      .from('vaas_end_users')
      .select('id, verification_status')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    if (fetchError || !existingUser) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Check if user has active verification sessions
    const { data: activeSessions, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id')
      .eq('end_user_id', id)
      .in('status', ['pending', 'document_uploaded', 'processing']);
    
    if (sessionError) {
      throw new Error(`Failed to check verification sessions: ${sessionError.message}`);
    }
    
    if (activeSessions && activeSessions.length > 0) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_HAS_ACTIVE_SESSIONS',
          message: 'Cannot delete user with active verification sessions. Complete or cancel verification sessions first.'
        }
      };
      
      return res.status(409).json(response);
    }
    
    // Delete the user (cascade will handle verification sessions and related data)
    const { error } = await vaasSupabase
      .from('vaas_end_users')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    
    if (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
    
    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'user.deleted',
      resourceType: 'end_user',
      resourceId: id,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: { message: 'User deleted successfully' }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[UserRoutes] Delete user failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'DELETE_USER_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Send verification invitation to end user
router.post('/:id/send-verification-invitation', requireAuth, requirePermission('manage_users'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    const { custom_message, expiration_days = 7 } = req.body;
    
    // Check if user exists and belongs to organization
    const { data: user, error: fetchError } = await vaasSupabase
      .from('vaas_end_users')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    if (fetchError || !user) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Check if user already has a completed verification
    if (user.verification_status === 'verified') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_ALREADY_VERIFIED',
          message: 'User is already verified'
        }
      };
      
      return res.status(409).json(response);
    }
    
    // Check if user has an email
    if (!user.email) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NO_EMAIL_ADDRESS',
          message: 'User must have an email address to receive verification invitations'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Get organization details for branding
    const { data: organization, error: orgError } = await vaasSupabase
      .from('vaas_organizations')
      .select('name, slug, branding, settings')
      .eq('id', organizationId)
      .single();
    
    if (orgError || !organization) {
      throw new Error('Failed to get organization details');
    }
    
    // Generate verification session token
    const sessionToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiration_days);
    
    // Create verification session
    const verificationSession = {
      id: uuidv4(),
      organization_id: organizationId,
      end_user_id: id,
      idswyft_verification_id: uuidv4(), // Will be updated when user starts verification
      idswyft_user_id: user.external_id || user.email || user.phone,
      status: 'pending' as const,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: session, error: sessionError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .insert(verificationSession)
      .select()
      .single();
    
    if (sessionError) {
      throw new Error(`Failed to create verification session: ${sessionError.message}`);
    }
    
    // Build verification URL
    const baseUrl = process.env.VAAS_CUSTOMER_PORTAL_URL || 'https://customer.idswyft.app';
    const verificationUrl = `${baseUrl}/verify/${sessionToken}`;
    
    // Update user with invitation details (keep status as 'pending' since invitation hasn't been completed yet)
    const { data: updatedUser, error: updateError } = await vaasSupabase
      .from('vaas_end_users')
      .update({
        verification_status: 'pending', // Keep as pending until user actually starts verification
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Failed to update user: ${updateError.message}`);
    }
    
    // Send verification invitation email
    console.log(`[UserRoutes] Sending verification invitation to ${user.email}...`);
    
    const userName = user.first_name ? 
      (user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name) : '';
    
    const emailSent = await emailService.sendVerificationInvitation({
      userEmail: user.email,
      userName,
      organizationName: organization.name,
      verificationUrl,
      expiresAt: expiresAt.toISOString(),
      customMessage: custom_message,
      organizationBranding: {
        primary_color: organization.branding?.primary_color,
        logo_url: organization.branding?.logo_url,
        company_name: organization.branding?.company_name || organization.name,
        welcome_message: organization.branding?.welcome_message
      }
    });
    
    if (emailSent) {
      console.log(`✅ Verification invitation email sent to ${user.email}`);
    } else {
      console.log(`⚠️ Failed to send verification invitation email to ${user.email}`);
    }
    
    auditService.logAuditEvent({
      organizationId,
      adminId: req.admin!.id,
      action: 'user.invitation_sent',
      resourceType: 'end_user',
      resourceId: id,
      details: { email: user.email, email_sent: emailSent },
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: {
        ...updatedUser,
        verification_url: verificationUrl,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        invitation_sent: emailSent,
        invitation_sent_at: emailSent ? new Date().toISOString() : undefined,
        email_status: emailSent ? 'sent' : 'failed'
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[UserRoutes] Send verification invitation failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'SEND_INVITATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Get user verification history
router.get('/:id/verifications', requireAuth, requirePermission('view_verifications'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.admin!.organization_id;
    
    // Check if user exists and belongs to organization
    const { data: user, error: userError } = await vaasSupabase
      .from('vaas_end_users')
      .select('id, email, first_name, last_name')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    if (userError || !user) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Get verification sessions for this user
    const { data: sessions, error: sessionsError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('*')
      .eq('end_user_id', id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    if (sessionsError) {
      throw new Error(`Failed to get verification sessions: ${sessionsError.message}`);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: {
        user,
        verification_sessions: sessions || []
      }
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('[UserRoutes] Get user verifications failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_USER_VERIFICATIONS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

export default router;