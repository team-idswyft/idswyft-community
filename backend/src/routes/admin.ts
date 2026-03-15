import express, { Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticateJWT, requireAdminRole } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError } from '@/middleware/errorHandler.js';
import { VerificationService } from '@/services/verification.js';
import { WebhookService } from '@/services/webhook.js';
import { StorageService } from '@/services/storage.js';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import { DataRetentionService } from '@/services/dataRetention.js';
import { ProviderMetricsService } from '@/services/providerMetrics.js';
import {
  getConversionFunnel,
  getGateRejectionBreakdown,
  getFraudPatterns,
  getRiskDistribution,
  type PeriodFilter,
} from '@/services/analyticsService.js';

const router = express.Router();
const verificationService = new VerificationService();
const webhookService = new WebhookService();
const storageService = new StorageService();

// Get dashboard overview
router.get('/dashboard',
  authenticateJWT,
  requireAdminRole(['admin', 'reviewer']),
  catchAsync(async (req: Request, res: Response) => {
    const [
      verificationStats,
      recentVerifications,
      developerCount,
      systemHealth
    ] = await Promise.all([
      verificationService.getVerificationStats(),
      verificationService.getVerificationRequestsForAdmin({ limit: 10 }),
      getDeveloperCount(),
      getSystemHealth()
    ]);
    
    res.json({
      stats: verificationStats,
      recent_verifications: recentVerifications.verifications.slice(0, 10),
      developer_count: developerCount,
      system_health: systemHealth
    });
  })
);

// Get verification requests with filtering
router.get('/verifications',
  authenticateJWT,
  requireAdminRole(['admin', 'reviewer']),
  [
    query('status')
      .optional()
      .isIn(['pending', 'verified', 'failed', 'manual_review'])
      .withMessage('Invalid status'),
    query('developer_id')
      .optional()
      .isUUID()
      .withMessage('Developer ID must be a valid UUID'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const filters = {
      status: req.query.status as any,
      developerId: req.query.developer_id as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50
    };
    
    const result = await verificationService.getVerificationRequestsForAdmin(filters);
    
    res.json({
      verifications: result.verifications,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: result.total,
        pages: Math.ceil(result.total / filters.limit)
      }
    });
  })
);

// Get specific verification request details
router.get('/verification/:id',
  authenticateJWT,
  requireAdminRole(['admin', 'reviewer']),
  [
    param('id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { id } = req.params;
    
    // Get verification with related data
    const { data: verification, error } = await supabase
      .from('verification_requests')
      .select(`
        *,
        user:users(*),
        developer:developers(*),
        document:documents(*),
        selfie:selfies(*)
      `)
      .eq('id', id)
      .single();
    
    if (error || !verification) {
      throw new NotFoundError('Verification request');
    }
    
    // Get file URLs if needed
    let documentUrl = null;
    let selfieUrl = null;
    
    if (verification.document?.file_path) {
      try {
        documentUrl = await storageService.getFileUrl(verification.document.file_path, 3600);
      } catch (error) {
        logger.warn('Failed to get document URL:', error);
      }
    }
    
    if (verification.selfie?.file_path) {
      try {
        selfieUrl = await storageService.getFileUrl(verification.selfie.file_path, 3600);
      } catch (error) {
        logger.warn('Failed to get selfie URL:', error);
      }
    }
    
    res.json({
      verification: {
        ...verification,
        document_url: documentUrl,
        selfie_url: selfieUrl
      }
    });
  })
);

// Manual review decision (approve/reject)
router.put('/verification/:id/review',
  authenticateJWT,
  requireAdminRole(['admin', 'reviewer']),
  [
    param('id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID'),
    body('decision')
      .isIn(['approve', 'reject'])
      .withMessage('Decision must be approve or reject'),
    body('reason')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Reason must be between 1 and 500 characters')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { id } = req.params;
    const { decision, reason } = req.body;
    const adminUserId = req.user!.id;
    
    let updatedVerification;
    
    if (decision === 'approve') {
      updatedVerification = await verificationService.approveVerification(id, adminUserId);
    } else {
      const reviewReason = reason || 'Rejected by admin review';
      updatedVerification = await verificationService.rejectVerification(id, adminUserId, reviewReason);
    }
    
    res.json({
      verification: updatedVerification,
      message: `Verification ${decision}d successfully`
    });
  })
);

// Get developers list
router.get('/developers',
  authenticateJWT,
  requireAdminRole(['admin']),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    
    const { data: developers, error } = await supabase
      .from('developers')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    const { count, error: countError } = await supabase
      .from('developers')
      .select('*', { count: 'exact', head: true });
    
    if (error || countError) {
      logger.error('Failed to get developers:', error || countError);
      throw new Error('Failed to get developers');
    }
    
    // Get verification stats for each developer
    const developersWithStats = await Promise.all(
      developers.map(async (dev) => {
        const stats = await verificationService.getVerificationStats(dev.id);
        const webhookStats = await webhookService.getWebhookStats(dev.id);
        return {
          ...dev,
          verification_stats: stats,
          webhook_stats: webhookStats
        };
      })
    );
    
    res.json({
      developers: developersWithStats,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  })
);

// Get system analytics
router.get('/analytics',
  authenticateJWT,
  requireAdminRole(['admin']),
  [
    query('period')
      .optional()
      .isIn(['7d', '30d', '90d'])
      .withMessage('Period must be 7d, 30d, or 90d'),
    query('developer_id')
      .optional()
      .isUUID()
      .withMessage('Developer ID must be a valid UUID')
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const period = req.query.period as string || '30d';
    const developerId = req.query.developer_id as string;
    
    const analytics = await getAnalytics(period, developerId);
    
    res.json(analytics);
  })
);

// System health endpoint
router.get('/health',
  authenticateJWT,
  requireAdminRole(['admin']),
  catchAsync(async (req: Request, res: Response) => {
    const health = await getSystemHealth();
    res.json(health);
  })
);

// Helper functions
async function getDeveloperCount(): Promise<number> {
  const { count, error } = await supabase
    .from('developers')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    logger.error('Failed to get developer count:', error);
    return 0;
  }
  
  return count || 0;
}

async function getSystemHealth(): Promise<any> {
  const [
    storageHealth,
    dbHealth,
    pendingWebhooks
  ] = await Promise.all([
    storageService.healthCheck(),
    checkDatabaseHealth(),
    getPendingWebhookCount()
  ]);
  
  return {
    database: dbHealth,
    storage: storageHealth,
    webhooks: {
      pending_deliveries: pendingWebhooks
    },
    overall_status: dbHealth.status === 'healthy' && storageHealth.status === 'healthy' ? 'healthy' : 'degraded'
  };
}

async function checkDatabaseHealth(): Promise<any> {
  try {
    const start = Date.now();
    const { error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    const latency = Date.now() - start;
    
    return {
      status: error ? 'error' : 'healthy',
      latency: `${latency}ms`,
      error: error?.message
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function getPendingWebhookCount(): Promise<number> {
  const { count, error } = await supabase
    .from('webhook_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  
  if (error) {
    logger.error('Failed to get pending webhook count:', error);
    return 0;
  }
  
  return count || 0;
}

async function getAnalytics(period: string, developerId?: string): Promise<any> {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  let query = supabase
    .from('verification_requests')
    .select('status, created_at')
    .gte('created_at', startDate.toISOString());
  
  if (developerId) {
    query = query.eq('developer_id', developerId);
  }
  
  const { data: verifications, error } = await query;
  
  if (error) {
    logger.error('Failed to get analytics:', error);
    throw new Error('Failed to get analytics');
  }
  
  // Process data into daily counts
  const dailyStats: Record<string, { date: string; verified: number; failed: number; pending: number; manual_review: number }> = {};
  
  // Initialize all days with zero counts
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyStats[dateStr] = {
      date: dateStr,
      verified: 0,
      failed: 0,
      pending: 0,
      manual_review: 0
    };
  }
  
  // Count verifications by day and status
  verifications.forEach(v => {
    const dateStr = v.created_at.split('T')[0];
    if (dailyStats[dateStr]) {
      dailyStats[dateStr][v.status as keyof typeof dailyStats[string]]++;
    }
  });
  
  return {
    period,
    daily_stats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
    totals: {
      verified: verifications.filter(v => v.status === 'verified').length,
      failed: verifications.filter(v => v.status === 'failed').length,
      pending: verifications.filter(v => v.status === 'pending').length,
      manual_review: verifications.filter(v => v.status === 'manual_review').length
    }
  };
}

// ─── Advanced Analytics Endpoints ──────────────────────────────

/** Parse period query params into PeriodFilter */
function parsePeriodFilter(req: Request): PeriodFilter | undefined {
  const period = req.query.period as string;
  if (!period) return undefined;
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start_date: start.toISOString(), end_date: end.toISOString() };
}

// GET /api/admin/analytics/funnel — Conversion funnel metrics
router.get('/analytics/funnel',
  authenticateJWT,
  requireAdminRole(['admin']),
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
    query('developer_id').optional().isUUID().withMessage('Developer ID must be a valid UUID'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const period = parsePeriodFilter(req);
    const developerId = req.query.developer_id as string | undefined;
    const funnel = await getConversionFunnel(period, developerId);
    res.json({ funnel });
  })
);

// GET /api/admin/analytics/rejections — Rejection breakdown by reason
router.get('/analytics/rejections',
  authenticateJWT,
  requireAdminRole(['admin']),
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const period = parsePeriodFilter(req);
    const rejections = await getGateRejectionBreakdown(period);
    res.json({ rejections });
  })
);

// GET /api/admin/analytics/fraud-patterns — Fraud pattern indicators
router.get('/analytics/fraud-patterns',
  authenticateJWT,
  requireAdminRole(['admin']),
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const period = parsePeriodFilter(req);
    const patterns = await getFraudPatterns(period);
    res.json({ patterns });
  })
);

// GET /api/admin/analytics/risk-distribution — Risk score distribution
router.get('/analytics/risk-distribution',
  authenticateJWT,
  requireAdminRole(['admin']),
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const period = parsePeriodFilter(req);
    const distribution = await getRiskDistribution(period);
    res.json({ distribution });
  })
);

// GET /api/admin/provider-metrics?provider=tesseract&days=30
router.get('/provider-metrics',
  authenticateJWT,
  requireAdminRole(['admin']),
  catchAsync(async (req: Request, res: Response) => {
    const { provider, days = '30' } = req.query;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'provider query param is required' });
    }
    const metrics = new ProviderMetricsService();
    const summary = await metrics.getProviderSummary(provider, parseInt(days as string, 10));
    res.json(summary);
  })
);

// GDPR / Right-to-erasure endpoint
router.delete('/user/:userId/data',
  authenticateJWT,
  requireAdminRole(['admin']),
  catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { reason = 'admin-requested' } = req.body;

    const retentionService = new DataRetentionService();
    await retentionService.deleteUserData(userId, reason);

    res.json({ success: true, message: `User data for ${userId} has been deleted` });
  })
);

export default router;