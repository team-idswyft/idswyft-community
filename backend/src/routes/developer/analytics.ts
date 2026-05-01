import express, { Request, Response } from 'express';
import { param } from 'express-validator';
import validator from 'validator';
import { supabase } from '@/config/database.js';
import { authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthenticationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import rateLimit from 'express-rate-limit';
import { loadSessionState, fetchRiskScore, buildVerificationResponse } from '@/verification/statusReader.js';
import { FLOW_PRESETS } from '@idswyft/shared';
import type { VerificationMode } from '@idswyft/shared';
import {
  getConversionFunnel,
  getGateRejectionBreakdown,
  getDailyVerificationVolume,
  getDailyResponseTimes,
  getDailyWebhookDeliveries,
  getDefaultPeriod,
} from '@/services/analyticsService.js';

const router = express.Router();

// Rate limiting for API key operations
const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 API key operations per minute (increased for development)
  message: {
    error: 'Too many API key operations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Get developer usage statistics
router.get('/stats',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }
    // Calendar-month-to-date so this endpoint agrees with /analytics quota.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: stats, error } = await supabase
      .from('verification_requests')
      .select('status, created_at')
      .eq('developer_id', developer.id)
      .gte('created_at', monthStart.toISOString());

    if (error) {
      logger.error('Failed to get developer stats:', error);
      throw new Error('Failed to get usage statistics');
    }

    const totalRequests = stats.length;
    const successfulRequests = stats.filter((s: any) => s.status === 'verified').length;
    const failedRequests = stats.filter((s: any) => s.status === 'failed').length;
    const pendingRequests = stats.filter((s: any) => s.status === 'pending').length;
    const manualReviewRequests = stats.filter((s: any) => s.status === 'manual_review').length;

    const monthlyLimit = 50;

    res.json({
      period: 'month',
      period_start: monthStart.toISOString(),
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      pending_requests: pendingRequests,
      manual_review_requests: manualReviewRequests,
      success_rate: totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(2) + '%' : '0%',
      monthly_limit: monthlyLimit,
      monthly_usage: totalRequests,
      remaining_quota: Math.max(0, monthlyLimit - totalRequests),
      quota_reset_date: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    });
  })
);

// Get API activity logs
router.get('/activity',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const apiKeyIdParam = typeof req.query.api_key_id === 'string' ? req.query.api_key_id : undefined;

    // If filtering by key, verify it belongs to the authenticated developer
    if (apiKeyIdParam) {
      if (!validator.isUUID(apiKeyIdParam)) {
        throw new ValidationError('Invalid API key ID format', 'api_key_id', apiKeyIdParam);
      }

      const { data: ownedKey, error: keyError } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', apiKeyIdParam)
        .eq('developer_id', developer.id)
        .eq('is_active', true)
        .single();

      if (keyError || !ownedKey) {
        throw new NotFoundError('API key not found or does not belong to this developer');
      }
    }

    // Query persisted activity logs from DB (survives server restarts)
    let activityQuery = supabase
      .from('api_activity_logs')
      .select('api_key_id, timestamp, method, endpoint, status_code, response_time_ms, user_agent, ip_address, error_message')
      .eq('developer_id', developer.id)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (apiKeyIdParam) {
      activityQuery = activityQuery.eq('api_key_id', apiKeyIdParam);
    }

    const [{ data: activityRows, error: activityError }, { data: verificationStats, error: statsError }] = await Promise.all([
      activityQuery,
      supabase.from('verification_requests').select('status').eq('developer_id', developer.id),
    ]);

    if (activityError) {
      logger.error('Failed to get activity logs:', activityError);
    }
    if (statsError) {
      logger.error('Failed to get verification stats:', statsError);
    }

    // Calculate statistics
    const stats = {
      total_requests: verificationStats?.length || 0,
      successful_requests: verificationStats?.filter((v: any) => v.status === 'verified').length || 0,
      failed_requests: verificationStats?.filter((v: any) => v.status === 'failed').length || 0,
      pending_requests: verificationStats?.filter((v: any) => v.status === 'pending').length || 0,
      manual_review_requests: verificationStats?.filter((v: any) => v.status === 'manual_review').length || 0
    };

    const formattedActivities = (activityRows || []).map((row: any) => ({
      api_key_id: row.api_key_id,
      timestamp: row.timestamp,
      method: row.method,
      endpoint: row.endpoint,
      status_code: row.status_code,
      response_time_ms: row.response_time_ms,
      user_agent: row.user_agent,
      ip_address: row.ip_address,
      error_message: row.error_message,
    }));

    // Derive session IDs from endpoint paths and fetch true verification outcomes.
    const sessionIdRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
    const sessionIds = Array.from(
      new Set(
        formattedActivities.flatMap((activity: any) => {
          const matches = activity.endpoint?.match(sessionIdRegex) || [];
          return matches;
        })
      )
    );

    let sessionOutcomes: Record<string, string> = {};
    if (sessionIds.length > 0) {
      const { data: verificationRows, error: sessionError } = await supabase
        .from('verification_requests')
        .select('id, status')
        .eq('developer_id', developer.id)
        .in('id', sessionIds);

      if (sessionError) {
        logger.error('Failed to fetch session outcomes:', sessionError);
      } else {
        sessionOutcomes = (verificationRows || []).reduce((acc: Record<string, string>, row: any) => {
          if (row?.id && row?.status) acc[row.id] = row.status;
          return acc;
        }, {});
      }
    }

    res.json({
      statistics: stats,
      recent_activities: formattedActivities,
      total_activities: formattedActivities.length,
      session_outcomes: sessionOutcomes
    });
  })
);

// Get full verification detail for a session (JWT-authenticated developer portal)
router.get('/verifications/:verificationId',
  apiKeyRateLimit,
  [
    param('verificationId')
      .isUUID()
      .withMessage('Invalid verification ID format')
  ],
  authenticateDeveloperJWT,
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { verificationId } = req.params;

    // Ownership check: verification must belong to this developer
    const { data: verification, error: verErr } = await supabase
      .from('verification_requests')
      .select('id, is_sandbox, duplicate_flags, verification_mode, manual_review_reason, status')
      .eq('id', verificationId)
      .eq('developer_id', developer.id)
      .single();

    if (verErr || !verification) {
      throw new NotFoundError('Verification not found or does not belong to this developer');
    }

    // Resolve flow early so it's available for the "no state" fallback too.
    // No INLINE_FLOW_FALLBACKS needed here — analytics runs on same image as API, shared pkg always current.
    const flow = FLOW_PRESETS[(verification as any).verification_mode as VerificationMode] ?? FLOW_PRESETS.full;

    // Load session state from verification_contexts
    const state = await loadSessionState(verificationId);

    if (!state) {
      // Session just initialized — no context row yet
      return res.json({
        success: true,
        verification_id: verificationId,
        status: 'pending',
        current_step: 0,
        total_steps: flow.totalSteps,
        message: 'Verification session has been created but no documents have been submitted yet.',
      });
    }

    const riskScore = await fetchRiskScore(verificationId);

    const response = buildVerificationResponse({
      verificationId,
      state,
      verification: verification as any,
      riskScore,
      flow,
    });
    res.json(response);
  })
);

// ─── Developer Analytics ────────────────────────────────────

router.get('/analytics',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const period = getDefaultPeriod();

    const [daily_volume, rejection_breakdown, daily_latency, funnel, daily_webhooks] =
      await Promise.all([
        getDailyVerificationVolume(period, developer.id),
        getGateRejectionBreakdown(period, developer.id),
        getDailyResponseTimes(period, developer.id),
        getConversionFunnel(period, developer.id),
        getDailyWebhookDeliveries(period, developer.id),
      ]);

    // Quota: count verification_requests this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('verification_requests')
      .select('*', { count: 'exact', head: true })
      .eq('developer_id', developer.id)
      .gte('created_at', monthStart.toISOString());

    const used = count ?? 0;
    const limit = 50;

    res.json({
      daily_volume,
      rejection_breakdown,
      daily_latency,
      quota: { used, limit },
      funnel,
      daily_webhooks,
    });
  })
);

export default router;
