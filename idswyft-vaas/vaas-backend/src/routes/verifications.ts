import { Router } from 'express';
import { verificationService } from '../services/verificationService.js';
import { requireAuth, requireApiKey, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { startVerificationSchema } from '../schemas/verification.schema.js';
import { apiKeyRateLimit } from '../middleware/rateLimit.js';
import { VaasApiResponse, VaasStartVerificationRequest } from '../types/index.js';
import { vaasSupabase } from '../config/database.js';
import { auditService } from '../services/auditService.js';

const router = Router();

// Start verification session (API key or admin auth)
router.post('/start', async (req: AuthenticatedRequest, res) => {
  try {
    let organizationId: string;
    
    // Check if using API key or admin auth
    if (req.headers['x-api-key']) {
      // Validate API key
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
    } else {
      // Validate admin auth
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      organizationId = req.admin!.organization_id;
      
      // Check permissions
      if (!req.admin!.permissions.review_verifications && !req.admin!.permissions.view_verifications) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Permission to manage verifications required'
          }
        };
        
        return res.status(403).json(response);
      }
    }
    
    // Validate request body
    const parseResult = startVerificationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      });
    }

    const verificationRequest: VaasStartVerificationRequest = parseResult.data;
    const result = await verificationService.startVerification(organizationId, verificationRequest);
    
    const response: VaasApiResponse = {
      success: true,
      data: result
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'START_VERIFICATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// List verifications (admin auth required)
router.get('/', requireAuth, requirePermission('view_verifications'), validatePagination, async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const params = {
      status: req.query.status as string,
      user_id: req.query.user_id as string,
      page: parseInt(req.query.page as string) || 1,
      per_page: parseInt(req.query.per_page as string) || 20,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string
    };
    
    const { verifications, total } = await verificationService.listVerifications(organizationId, params);
    
    const response: VaasApiResponse = {
      success: true,
      data: verifications,
      meta: {
        total,
        page: params.page,
        per_page: params.per_page,
        has_more: total > params.page * params.per_page
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LIST_VERIFICATIONS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Get verification details (admin auth or API key)
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
    } else {
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      organizationId = req.admin!.organization_id;

      if (!req.admin!.permissions.view_verifications) {
        const response: VaasApiResponse = {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Permission to view verifications required'
          }
        };
        
        return res.status(403).json(response);
      }
    }
    
    const verification = await verificationService.getVerification(organizationId, id);
    
    if (!verification) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Verification not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: verification
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_VERIFICATION_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Manual review: approve verification
router.post('/:id/approve', requireAuth, requirePermission('approve_verifications'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const organizationId = req.admin!.organization_id;
    const reviewerId = req.admin!.id;
    
    const verification = await verificationService.approveVerification(organizationId, id, reviewerId, notes);

    auditService.logAuditEvent({
      organizationId,
      adminId: reviewerId,
      action: 'verification.approved',
      resourceType: 'verification',
      resourceId: id,
      details: { notes },
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: verification
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'APPROVE_VERIFICATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Manual review: reject verification
router.post('/:id/reject', requireAuth, requirePermission('approve_verifications'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;
    const organizationId = req.admin!.organization_id;
    const reviewerId = req.admin!.id;
    
    if (!reason) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Rejection reason is required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    const verification = await verificationService.rejectVerification(organizationId, id, reviewerId, reason, notes);

    auditService.logAuditEvent({
      organizationId,
      adminId: reviewerId,
      action: 'verification.rejected',
      resourceType: 'verification',
      resourceId: id,
      details: { reason, notes },
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: verification
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'REJECT_VERIFICATION_FAILED',
        message: error.message
      }
    };
    
    res.status(400).json(response);
  }
});

// Sync verification status from main Idswyft API (admin only)
router.post('/:id/sync', requireAuth, requirePermission('view_verifications'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    // Get the verification to find the Idswyft verification ID
    const verification = await verificationService.getVerification(req.admin!.organization_id, id);
    
    if (!verification) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Verification not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    const updatedVerification = await verificationService.syncVerificationFromIdswyft(verification.idswyft_verification_id);

    auditService.logAuditEvent({
      organizationId: req.admin!.organization_id,
      adminId: req.admin!.id,
      action: 'verification.synced',
      resourceType: 'verification',
      resourceId: id,
      req,
    });

    const response: VaasApiResponse = {
      success: true,
      data: updatedVerification
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'SYNC_VERIFICATION_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Get verification statistics (admin only)
router.get('/stats/overview', requireAuth, requirePermission('view_analytics'), async (req: AuthenticatedRequest, res) => {
  try {
    const organizationId = req.admin!.organization_id;
    const days = parseInt(req.query.days as string) || 30;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get verification counts by status
    const { data: statusCounts, error: statusError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('status')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString());
      
    if (statusError) {
      throw new Error('Failed to get verification statistics');
    }
    
    // Get end user counts by status
    const { data: userCounts, error: userError } = await vaasSupabase
      .from('vaas_end_users')
      .select('verification_status')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString());
      
    if (userError) {
      throw new Error('Failed to get user statistics');
    }
    
    // Calculate statistics
    const verificationStats = statusCounts.reduce((acc: any, session: any) => {
      acc[session.status] = (acc[session.status] || 0) + 1;
      return acc;
    }, {});
    
    const userStats = userCounts.reduce((acc: any, user: any) => {
      acc[user.verification_status] = (acc[user.verification_status] || 0) + 1;
      return acc;
    }, {});
    
    const total = statusCounts.length;
    const completed = verificationStats.completed || 0;
    const failed = verificationStats.failed || 0;
    const pending = verificationStats.pending || 0;
    const processing = verificationStats.processing || 0;
    
    const response: VaasApiResponse = {
      success: true,
      data: {
        period_days: days,
        verification_sessions: {
          total,
          completed,
          failed,
          pending,
          processing,
          success_rate: total > 0 ? Math.round((completed / total) * 100) : 0
        },
        end_users: {
          total: userCounts.length,
          verified: userStats.verified || 0,
          failed: userStats.failed || 0,
          pending: userStats.pending || 0,
          in_progress: userStats.in_progress || 0,
          manual_review: userStats.manual_review || 0
        }
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_STATS_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Get verification session by token (public endpoint for customer portal)
router.get('/session/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Session token is required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Find verification session by token
    const { data: session, error } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select(`
        id,
        status,
        expires_at,
        results,
        created_at,
        updated_at,
        vaas_organizations!inner(
          id,
          name,
          branding,
          settings
        ),
        vaas_end_users!inner(
          id,
          email,
          first_name,
          last_name,
          verification_status
        )
      `)
      .eq('session_token', token)
      .single();
      
    if (error || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid or expired verification session'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'This verification session has expired'
        }
      };
      
      return res.status(410).json(response);
    }
    
    // Block access to sessions that have reached a terminal status.
    // Once verified/failed/completed/manual_review/terminated, the link is stale.
    const terminalStatuses = ['verified', 'failed', 'completed', 'manual_review', 'terminated'];
    if (terminalStatuses.includes(session.status)) {
      const messages: Record<string, string> = {
        verified:      'This identity has already been verified. The link is no longer active.',
        completed:     'This identity has already been verified. The link is no longer active.',
        failed:        'This verification has already been processed. Please request a new link if needed.',
        manual_review: 'This verification is under review. You will be notified of the result.',
        terminated:    'This verification link has been deactivated.',
      };

      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_COMPLETED',
          message: messages[session.status] || 'This verification link is no longer active.',
          details: { status: session.status }
        }
      };

      return res.status(410).json(response);
    }
    
    // Format response for customer portal
    const organization = (session.vaas_organizations as any);
    const endUser = (session.vaas_end_users as any);
    
    const sessionData = {
      id: session.id,
      status: session.status,
      expires_at: session.expires_at,
      organization: {
        name: organization.name,
        branding: organization.branding || {},
        settings: organization.settings || {}
      },
      user: {
        first_name: endUser.first_name,
        last_name: endUser.last_name,
        email: endUser.email
      },
      verification_settings: {
        require_liveness: organization.settings?.require_liveness !== false,
        require_back_of_id: organization.settings?.require_back_of_id !== false
      }
    };
    
    const response: VaasApiResponse = {
      success: true,
      data: sessionData
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('[VerificationRoutes] Get session failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'GET_SESSION_FAILED',
        message: 'Failed to retrieve verification session'
      }
    };
    
    res.status(500).json(response);
  }
});

// Terminate verification session (public endpoint for customer portal)
router.post('/session/:token/terminate', async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Session token is required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Find and terminate the session
    const { data: session, error: findError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status, organization_id')
      .eq('session_token', token)
      .single();
      
    if (findError || !session) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid verification session'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Only allow termination of completed sessions
    if (session.status !== 'completed' && session.status !== 'failed') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_SESSION_STATUS',
          message: 'Only completed or failed sessions can be terminated'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Update session to terminated status
    const { error: updateError } = await vaasSupabase
      .from('vaas_verification_sessions')
      .update({
        status: 'terminated',
        terminated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);
      
    if (updateError) {
      throw new Error('Failed to terminate session');
    }
    
    console.log(`[VerificationRoutes] Session ${token} terminated successfully`);
    
    const response: VaasApiResponse = {
      success: true,
      data: {
        message: 'Verification session terminated successfully'
      }
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('[VerificationRoutes] Terminate session failed:', error);
    
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'TERMINATE_SESSION_FAILED',
        message: 'Failed to terminate verification session'
      }
    };
    
    res.status(500).json(response);
  }
});

export default router;