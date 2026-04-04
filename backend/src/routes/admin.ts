import express, { Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import { authenticateJWT, requireAdminRole, authenticateAdminOrReviewer, requireOrgAdminOrPlatformAdmin } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthorizationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
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
  authenticateAdminOrReviewer,
  catchAsync(async (req: Request, res: Response) => {
    // Scope to developer's data when a reviewer
    const developerId = req.reviewer?.developer_id;

    const [
      verificationStats,
      recentVerifications,
      developerCount,
      systemHealth
    ] = await Promise.all([
      verificationService.getVerificationStats(developerId),
      verificationService.getVerificationRequestsForAdmin({ limit: 10, developerId }),
      developerId ? Promise.resolve(1) : getDeveloperCount(),
      developerId ? Promise.resolve({ overall_status: 'healthy' }) : getSystemHealth()
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
  authenticateAdminOrReviewer,
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
    // Reviewer: always scoped to their developer — never trust query param
    const scopedDeveloperId = req.reviewer
      ? req.reviewer.developer_id
      : (req.query.developer_id as string | undefined);

    const filters = {
      status: req.query.status as any,
      developerId: scopedDeveloperId,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50
    };

    const result = await verificationService.getVerificationRequestsForAdmin(filters);

    // Batch-fetch documents & selfies by verification_request_id (the reliable FK)
    const vIds = result.verifications.map((v: any) => v.id);
    const [{ data: allDocs }, { data: allSelfies }] = await Promise.all([
      supabase.from('documents').select('verification_request_id, file_path').in('verification_request_id', vIds),
      supabase.from('selfies').select('verification_request_id, file_path').in('verification_request_id', vIds),
    ]);

    // Build lookup maps: verification_id → first file_path
    const docMap = new Map<string, string>();
    const selfieMap = new Map<string, string>();
    for (const d of (allDocs || [])) {
      if (d.file_path && !docMap.has(d.verification_request_id)) docMap.set(d.verification_request_id, d.file_path);
    }
    for (const s of (allSelfies || [])) {
      if (s.file_path && !selfieMap.has(s.verification_request_id)) selfieMap.set(s.verification_request_id, s.file_path);
    }

    // Generate signed thumbnail URLs in parallel
    const verifications = await Promise.all(
      result.verifications.map(async (v: any) => {
        let document_thumbnail = null;
        let selfie_thumbnail = null;
        const docPath = docMap.get(v.id);
        const selfiePath = selfieMap.get(v.id);
        try { if (docPath) document_thumbnail = await storageService.getFileUrl(docPath, 3600); } catch { /* skip */ }
        try { if (selfiePath) selfie_thumbnail = await storageService.getFileUrl(selfiePath, 3600); } catch { /* skip */ }
        return { ...v, document_thumbnail, selfie_thumbnail };
      })
    );

    res.json({
      verifications,
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
  authenticateAdminOrReviewer,
  [
    param('id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Get verification with related data
    let verificationQuery = supabase
      .from('verification_requests')
      .select(`
        *,
        user:users(*),
        developer:developers(*),
        document:documents!verification_requests_document_id_fkey(*),
        selfie:selfies!verification_requests_selfie_id_fkey(*)
      `)
      .eq('id', id);

    // Scope to developer when reviewer
    if (req.reviewer) {
      verificationQuery = verificationQuery.eq('developer_id', req.reviewer.developer_id);
    }

    const { data: verification, error } = await verificationQuery.single();
    
    if (error || !verification) {
      throw new NotFoundError('Verification request');
    }
    
    // Fetch ALL documents for this verification (front + back for batch items)
    const { data: allDocuments } = await supabase
      .from('documents')
      .select('*')
      .eq('verification_request_id', id)
      .order('created_at', { ascending: true });

    // Resolve signed URLs for all documents and selfie
    const documentUrls: Array<{ id: string; file_name: string; document_type: string; url: string | null }> = [];
    for (const doc of (allDocuments || [])) {
      let url = null;
      if (doc.file_path) {
        try { url = await storageService.getFileUrl(doc.file_path, 3600); } catch { /* skip */ }
      }
      documentUrls.push({ id: doc.id, file_name: doc.file_name, document_type: doc.document_type, url });
    }

    let selfieUrl = null;
    if (verification.selfie?.file_path) {
      try { selfieUrl = await storageService.getFileUrl(verification.selfie.file_path, 3600); } catch { /* skip */ }
    }

    // Legacy single document_url for backward compat
    const documentUrl = documentUrls.length > 0 ? documentUrls[0].url : null;

    // Fetch debug data: gate context, OCR, risk scores, AML, and duplicate fingerprints
    const [ctxRes, riskRes, amlRes, dedupRes] = await Promise.all([
      supabase.from('verification_contexts').select('context').eq('verification_id', id).maybeSingle(),
      supabase.from('verification_risk_scores').select('overall_score, risk_level, risk_factors, computed_at').eq('verification_request_id', id).maybeSingle(),
      supabase.from('aml_screenings').select('risk_level, match_found, match_count, matches, lists_checked, screened_at').eq('verification_request_id', id).maybeSingle(),
      supabase.from('dedup_fingerprints').select('fingerprint_type, hash_value, created_at').eq('verification_request_id', id),
    ]);

    if (ctxRes.error) logger.warn('Debug: verification_contexts query failed', { id, error: ctxRes.error.message });
    if (riskRes.error) logger.warn('Debug: risk_scores query failed', { id, error: riskRes.error.message });
    if (amlRes.error) logger.warn('Debug: aml_screenings query failed', { id, error: amlRes.error.message });
    if (dedupRes.error) logger.warn('Debug: dedup_fingerprints query failed', { id, error: dedupRes.error.message });

    const ctx: any = ctxRes.data?.context || {};
    const frontDoc = (allDocuments || []).find((d: any) => !d.is_back_of_id);
    const backDoc = (allDocuments || []).find((d: any) => d.is_back_of_id);

    const debug = {
      gates: {
        ocr: {
          extracted: frontDoc?.ocr_extracted ?? null,
          quality_score: frontDoc?.quality_score ?? null,
          quality_analysis: frontDoc?.quality_analysis ?? null,
          fields: frontDoc?.ocr_data ?? null,
          back_fields: backDoc?.ocr_data ?? null,
          barcode_data: backDoc?.barcode_data ?? null,
        },
        cross_validation: {
          score: verification.cross_validation_score,
          verdict: ctx.cross_validation?.verdict ?? null,
          mismatches: ctx.cross_validation?.mismatches ?? [],
          results: frontDoc?.cross_validation_results ?? backDoc?.cross_validation_results ?? null,
        },
        liveness: {
          score: verification.liveness_score,
          passed: ctx.liveness?.passed ?? null,
        },
        deepfake: {
          is_real: ctx.deepfake_check?.isReal ?? null,
          real_probability: ctx.deepfake_check?.realProbability ?? null,
          fake_probability: ctx.deepfake_check?.fakeProbability ?? null,
        },
        face_match: {
          score: verification.face_match_score,
          passed: ctx.face_match?.passed ?? null,
        },
        photo_consistency: {
          score: verification.photo_consistency_score,
        },
        address: {
          status: verification.address_verification_status,
          score: verification.address_match_score,
        },
      },
      risk: riskRes.data ? {
        overall_score: riskRes.data.overall_score,
        risk_level: riskRes.data.risk_level,
        factors: riskRes.data.risk_factors,
        computed_at: riskRes.data.computed_at,
      } : null,
      aml: amlRes.data ? {
        risk_level: amlRes.data.risk_level,
        match_found: amlRes.data.match_found,
        match_count: amlRes.data.match_count,
        matches: amlRes.data.matches,
        lists_checked: amlRes.data.lists_checked,
        screened_at: amlRes.data.screened_at,
      } : null,
      timing: {
        session_started_at: verification.session_started_at,
        processing_completed_at: verification.processing_completed_at,
      },
      decision: {
        failure_reason: verification.failure_reason,
        manual_review_reason: verification.manual_review_reason,
        reviewed_by: verification.reviewed_by,
        reviewed_at: verification.reviewed_at,
      },
      duplicates: {
        flags: verification.duplicate_flags ?? null,
        fingerprints: dedupRes.data ?? [],
      },
    };

    res.json({
      verification: {
        ...verification,
        document_url: documentUrl,
        selfie_url: selfieUrl,
        documents: documentUrls,
        debug,
      }
    });
  })
);

// Get linked verifications (duplicates) for a specific verification
router.get('/verification/:id/duplicates',
  authenticateAdminOrReviewer,
  [
    param('id').isUUID().withMessage('Verification ID must be a valid UUID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Fetch duplicate flags from the verification
    let query = supabase
      .from('verification_requests')
      .select('duplicate_flags, developer_id')
      .eq('id', id);

    if (req.reviewer) {
      query = query.eq('developer_id', req.reviewer.developer_id);
    }

    const { data: vr, error } = await query.single();
    if (error || !vr) throw new NotFoundError('Verification request');

    const flags = (vr.duplicate_flags as any[]) || [];
    const linkedIds = [...new Set(flags.map((f: any) => f.matched_verification_id))];

    if (linkedIds.length === 0) {
      return res.json({ verification_id: id, linked_verifications: [] });
    }

    // Fetch basic info for each linked verification (scoped to same developer for defense-in-depth)
    const { data: linked } = await supabase
      .from('verification_requests')
      .select('id, status, created_at, user_id')
      .in('id', linkedIds)
      .eq('developer_id', vr.developer_id);

    res.json({
      verification_id: id,
      linked_verifications: (linked || []).map((v: any) => ({
        id: v.id,
        status: v.status,
        created_at: v.created_at,
        user_id: v.user_id,
      })),
    });
  })
);

// Manual review decision (approve/reject/override)
// Fires webhooks to the developer's downstream systems after status change.
router.put('/verification/:id/review',
  authenticateAdminOrReviewer,
  [
    param('id')
      .isUUID()
      .withMessage('Verification ID must be a valid UUID'),
    body('decision')
      .isIn(['approve', 'reject', 'override'])
      .withMessage('Decision must be approve, reject, or override'),
    body('reason')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Reason must be between 1 and 500 characters'),
    body('new_status')
      .optional()
      .isIn(['verified', 'failed', 'manual_review', 'pending'])
      .withMessage('new_status must be verified, failed, manual_review, or pending'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { decision, reason, new_status } = req.body;
    const adminUserId = req.user?.id || req.reviewer?.id || '';

    // If reviewer, verify the verification belongs to their developer
    if (req.reviewer) {
      const { data: check } = await supabase
        .from('verification_requests')
        .select('id')
        .eq('id', id)
        .eq('developer_id', req.reviewer.developer_id)
        .single();
      if (!check) throw new NotFoundError('Verification request');
    }

    // Override requires org admin or platform admin — regular reviewers can only approve/reject
    if (decision === 'override' && req.reviewer && req.reviewer.role !== 'admin') {
      throw new AuthorizationError('Only organization admins can override verification status');
    }

    // Override requires new_status
    if (decision === 'override' && !new_status) {
      throw new ValidationError('new_status is required for override decisions', 'new_status', '');
    }

    let updatedVerification;
    let finalStatus: string;

    if (decision === 'approve') {
      updatedVerification = await verificationService.approveVerification(id, adminUserId);
      finalStatus = 'verified';
    } else if (decision === 'reject') {
      const reviewReason = reason || 'Rejected by admin review';
      updatedVerification = await verificationService.rejectVerification(id, adminUserId, reviewReason);
      finalStatus = 'failed';
    } else {
      // Override — set any valid status directly
      const { data, error } = await supabase
        .from('verification_requests')
        .update({
          status: new_status,
          reviewed_by: adminUserId,
          reviewed_at: new Date().toISOString(),
          failure_reason: new_status === 'failed' ? (reason || 'Status overridden by reviewer') : null,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !data) throw new NotFoundError('Verification request');
      updatedVerification = data;
      finalStatus = new_status;
    }

    res.json({
      verification: updatedVerification,
      message: `Verification ${decision === 'override' ? 'overridden to ' + new_status : decision + 'd'} successfully`,
    });

    // ── Webhook forwarding (after response is sent) ──────────────
    // Fire webhook using the developer's scoped API key so downstream
    // systems are notified of the manual review decision.
    try {
      const developerId = updatedVerification.developer_id;
      const userId = updatedVerification.user_id;
      const isSandbox = updatedVerification.is_sandbox || false;

      const eventType = finalStatus === 'verified' ? 'verification.completed'
        : finalStatus === 'failed' ? 'verification.failed'
        : finalStatus === 'manual_review' ? 'verification.manual_review'
        : null;

      if (eventType && developerId) {
        const webhooks = await webhookService.getActiveWebhooksForDeveloper(developerId, isSandbox, eventType);
        for (const webhook of webhooks) {
          webhookService.sendWebhook(webhook, id, {
            event: eventType,
            user_id: userId,
            verification_id: id,
            status: finalStatus as any,
            timestamp: new Date().toISOString(),
            data: {
              failure_reason: finalStatus === 'failed' ? (reason || 'Manual review decision') : undefined,
              manual_review_reason: decision === 'override' ? `Status overridden to ${new_status} by reviewer` : undefined,
            },
          }).catch(err => {
            logger.error('Admin review webhook delivery error:', {
              webhookId: webhook.id,
              verificationId: id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    } catch (err) {
      logger.error('Admin review webhook forwarding failed:', {
        verificationId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })
);

// Get developers list (platform admin only)
router.get('/developers',
  authenticateJWT as any,
  requireAdminRole(['admin']) as any,
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
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
      developers.map(async (dev: any) => {
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

// Get system analytics (platform admin or org admin)
router.get('/analytics',
  authenticateAdminOrReviewer,
  requireOrgAdminOrPlatformAdmin,
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
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const period = req.query.period as string || '30d';
    // Org admins are scoped to their developer; platform admins can optionally filter
    const developerId = req.reviewer?.developer_id || req.query.developer_id as string;

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
  verifications.forEach((v: any) => {
    const dateStr = v.created_at.split('T')[0];
    if (dailyStats[dateStr]) {
      dailyStats[dateStr][v.status as keyof typeof dailyStats[string]]++;
    }
  });
  
  return {
    period,
    daily_stats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
    totals: {
      verified: verifications.filter((v: any) => v.status === 'verified').length,
      failed: verifications.filter((v: any) => v.status === 'failed').length,
      pending: verifications.filter((v: any) => v.status === 'pending').length,
      manual_review: verifications.filter((v: any) => v.status === 'manual_review').length
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
  authenticateAdminOrReviewer,
  requireOrgAdminOrPlatformAdmin,
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
    query('developer_id').optional().isUUID().withMessage('Developer ID must be a valid UUID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const period = parsePeriodFilter(req);
    const developerId = req.reviewer?.developer_id || req.query.developer_id as string | undefined;
    const funnel = await getConversionFunnel(period, developerId);
    res.json({ funnel });
  })
);

// GET /api/admin/analytics/rejections — Rejection breakdown by reason
router.get('/analytics/rejections',
  authenticateAdminOrReviewer,
  requireOrgAdminOrPlatformAdmin,
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const period = parsePeriodFilter(req);
    const rejections = await getGateRejectionBreakdown(period);
    res.json({ rejections });
  })
);

// GET /api/admin/analytics/fraud-patterns — Fraud pattern indicators
router.get('/analytics/fraud-patterns',
  authenticateAdminOrReviewer,
  requireOrgAdminOrPlatformAdmin,
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const period = parsePeriodFilter(req);
    const patterns = await getFraudPatterns(period);
    res.json({ patterns });
  })
);

// GET /api/admin/analytics/risk-distribution — Risk score distribution
router.get('/analytics/risk-distribution',
  authenticateAdminOrReviewer,
  requireOrgAdminOrPlatformAdmin,
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Period must be 7d, 30d, or 90d'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
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

// ── Audit Log Export ─────────────────────────────────────────────────
// Export verification decisions with full gate-by-gate reasoning.
// Supports CSV (for compliance teams) and JSON (for programmatic access).
router.get('/audit/export',
  authenticateAdminOrReviewer,
  [
    query('from').optional().isISO8601().withMessage('from must be ISO8601 date'),
    query('to').optional().isISO8601().withMessage('to must be ISO8601 date'),
    query('status').optional().isIn(['pending', 'verified', 'failed', 'manual_review']).withMessage('Invalid status'),
    query('developer_id').optional().isUUID().withMessage('developer_id must be a valid UUID'),
    query('format').optional().isIn(['csv', 'json']).withMessage('format must be csv or json'),
    query('limit').optional().isInt({ min: 1, max: 5000 }).withMessage('limit must be between 1 and 5000'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be >= 0'),
    query('include_sandbox').optional().isBoolean().withMessage('include_sandbox must be boolean'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const format = (req.query.format as string) || 'json';
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 5000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const includeSandbox = req.query.include_sandbox === 'true';

    // Reviewer: always scoped to their developer
    const developerId = req.reviewer
      ? req.reviewer.developer_id
      : (req.query.developer_id as string | undefined);

    // Build query
    let q = supabase
      .from('verification_requests')
      .select(`
        id, user_id, developer_id, status, source, issuing_country, is_sandbox,
        face_match_score, liveness_score, cross_validation_score, photo_consistency_score,
        address_verification_status, address_match_score,
        failure_reason, manual_review_reason, reviewed_by, reviewed_at,
        created_at, session_started_at, processing_completed_at, updated_at,
        addons, aml_enabled
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (developerId) q = q.eq('developer_id', developerId);
    if (req.query.status) q = q.eq('status', req.query.status as string);
    if (req.query.from) q = q.gte('created_at', req.query.from as string);
    if (req.query.to) q = q.lte('created_at', req.query.to as string);
    if (!includeSandbox) q = q.eq('is_sandbox', false);

    const { data: verifications, error } = await q;
    if (error) {
      logger.error('Audit export query failed:', { error: error.message });
      throw new Error('Failed to query verification records');
    }

    const vIds = (verifications || []).map((v: any) => v.id);

    // Helper: chunk .in() queries to avoid PostgREST URL length limits
    async function batchIn(table: string, column: string, ids: string[], selectCols: string) {
      if (!ids.length) return [];
      const CHUNK = 500;
      const chunks = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        chunks.push(supabase.from(table).select(selectCols).in(column, ids.slice(i, i + CHUNK)));
      }
      const results = await Promise.all(chunks);
      const rows: any[] = [];
      for (const r of results) {
        if (r.error) logger.warn(`Audit export: ${table} query failed`, { error: r.error.message });
        if (r.data) rows.push(...r.data);
      }
      return rows;
    }

    // Batch-fetch contexts, documents, risk scores, AML screenings
    const [contexts, documents, riskScores, amlScreenings] = await Promise.all([
      batchIn('verification_contexts', 'verification_id', vIds, 'verification_id, context'),
      batchIn('documents', 'verification_request_id', vIds, 'verification_request_id, document_type, ocr_data, ocr_extracted, quality_score, cross_validation_results, is_back_of_id'),
      batchIn('verification_risk_scores', 'verification_request_id', vIds, 'verification_request_id, overall_score, risk_level, risk_factors'),
      batchIn('aml_screenings', 'verification_request_id', vIds, 'verification_request_id, risk_level, match_found, lists_checked, screened_at'),
    ]);

    // Build lookup maps
    const contextMap = new Map(contexts.map((c: any) => [c.verification_id, c.context]));
    const docMap = new Map<string, any[]>();
    for (const d of documents) {
      const list = docMap.get(d.verification_request_id) || [];
      list.push(d);
      docMap.set(d.verification_request_id, list);
    }
    const riskMap = new Map(riskScores.map((r: any) => [r.verification_request_id, r]));
    const amlMap = new Map(amlScreenings.map((a: any) => [a.verification_request_id, a]));

    // Assemble audit records
    const records = (verifications || []).map((v: any) => {
      const ctx: any = contextMap.get(v.id) || {};
      const docs = docMap.get(v.id) || [];
      const risk: any = riskMap.get(v.id);
      const aml: any = amlMap.get(v.id);
      const frontDoc = docs.find((d: any) => !d.is_back_of_id);

      return {
        verification_id: v.id,
        user_id: v.user_id,
        developer_id: v.developer_id,
        status: v.status,
        source: v.source,
        issuing_country: v.issuing_country,
        is_sandbox: v.is_sandbox,
        created_at: v.created_at,
        processing_completed_at: v.processing_completed_at,

        // Gate results
        gates: {
          ocr: {
            extracted: frontDoc?.ocr_extracted ?? null,
            quality_score: frontDoc?.quality_score ?? null,
            fields_extracted: frontDoc?.ocr_data ? Object.keys(frontDoc.ocr_data).filter((k: string) => frontDoc.ocr_data[k]) : [],
          },
          cross_validation: {
            score: v.cross_validation_score,
            verdict: ctx.cross_validation?.verdict ?? null,
            mismatches: ctx.cross_validation?.mismatches ?? [],
          },
          liveness: {
            score: v.liveness_score,
            passed: ctx.liveness?.passed ?? null,
          },
          deepfake: {
            is_real: ctx.deepfake_check?.isReal ?? null,
            real_probability: ctx.deepfake_check?.realProbability ?? null,
          },
          face_match: {
            score: v.face_match_score,
            passed: ctx.face_match?.passed ?? null,
          },
          aml_screening: aml ? {
            risk_level: aml.risk_level,
            match_found: aml.match_found,
            lists_checked: aml.lists_checked,
            screened_at: aml.screened_at,
          } : null,
        },

        // Risk assessment
        risk: risk ? {
          overall_score: risk.overall_score,
          risk_level: risk.risk_level,
          factors: risk.risk_factors,
        } : null,

        // Decision trail
        decision: {
          failure_reason: v.failure_reason,
          manual_review_reason: v.manual_review_reason,
          reviewed_by: v.reviewed_by,
          reviewed_at: v.reviewed_at,
        },
      };
    });

    if (format === 'csv') {
      // Flatten records into CSV
      const csvHeaders = [
        'verification_id', 'user_id', 'developer_id', 'status', 'source',
        'issuing_country', 'is_sandbox', 'created_at', 'processing_completed_at',
        'ocr_extracted', 'ocr_quality_score', 'ocr_fields',
        'cross_validation_score', 'cross_validation_verdict',
        'liveness_score', 'liveness_passed',
        'deepfake_is_real', 'deepfake_probability',
        'face_match_score', 'face_match_passed',
        'aml_risk_level', 'aml_match_found', 'aml_lists_checked',
        'risk_overall_score', 'risk_level',
        'failure_reason', 'manual_review_reason', 'reviewed_by', 'reviewed_at',
      ];

      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = Array.isArray(val) ? val.join('; ') : String(val);
        // Sanitize formula injection for spreadsheet applications
        const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
        return sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')
          ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
      };

      const csvRows = records.map((r: any) => [
        r.verification_id, r.user_id, r.developer_id, r.status, r.source,
        r.issuing_country, r.is_sandbox, r.created_at, r.processing_completed_at,
        r.gates.ocr.extracted, r.gates.ocr.quality_score, r.gates.ocr.fields_extracted,
        r.gates.cross_validation.score, r.gates.cross_validation.verdict,
        r.gates.liveness.score, r.gates.liveness.passed,
        r.gates.deepfake.is_real, r.gates.deepfake.real_probability,
        r.gates.face_match.score, r.gates.face_match.passed,
        r.gates.aml_screening?.risk_level, r.gates.aml_screening?.match_found, r.gates.aml_screening?.lists_checked,
        r.risk?.overall_score, r.risk?.risk_level,
        r.decision.failure_reason, r.decision.manual_review_reason, r.decision.reviewed_by, r.decision.reviewed_at,
      ].map(escapeCSV).join(','));

      const csv = '\xEF\xBB\xBF' + [csvHeaders.join(','), ...csvRows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    // JSON format
    res.json({
      export_date: new Date().toISOString(),
      record_count: records.length,
      filters: {
        from: req.query.from || null,
        to: req.query.to || null,
        status: req.query.status || null,
        developer_id: developerId || null,
        include_sandbox: includeSandbox,
      },
      records,
    });
  })
);

// GDPR / Right-to-erasure endpoint (platform admin or org admin with ownership check)
router.delete('/user/:userId/data',
  authenticateAdminOrReviewer,
  requireOrgAdminOrPlatformAdmin,
  catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { reason = 'admin-requested' } = req.body;

    // Org admins can only delete users who have verifications under their developer
    if (req.reviewer) {
      const { data } = await supabase
        .from('verification_requests')
        .select('id')
        .eq('user_id', userId)
        .eq('developer_id', req.reviewer.developer_id)
        .limit(1)
        .maybeSingle();
      if (!data) throw new NotFoundError('User not found in your verification data');
    }

    const retentionService = new DataRetentionService();
    await retentionService.deleteUserData(userId, reason);

    res.json({ success: true, message: `User data for ${userId} has been deleted` });
  })
);

export default router;