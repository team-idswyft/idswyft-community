import { Router } from 'express';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { platformAnalyticsService } from '../services/platformAnalyticsService.js';
import { VaasApiResponse } from '../types/index.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/platform/analytics/summary
 * Dashboard summary stats with current vs previous 30-day comparison.
 */
router.get('/summary', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const data = await platformAnalyticsService.getSummaryStats();
    const response: VaasApiResponse = { success: true, data };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

/**
 * GET /api/platform/analytics/verification-trend?days=30&org_id=UUID
 * Daily verification counts by status, padded with zeroes.
 */
router.get('/verification-trend', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 30, 1), 90);
    const orgId = req.query.org_id as string | undefined;
    if (orgId && !UUID_RE.test(orgId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAM', message: 'org_id must be a valid UUID' },
      } as VaasApiResponse);
    }
    const data = await platformAnalyticsService.getVerificationTrend(days, orgId);
    const response: VaasApiResponse = { success: true, data };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

/**
 * GET /api/platform/analytics/org-health?limit=10
 * Top orgs ranked by verification volume with success rate and webhook health.
 */
router.get('/org-health', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 50);
    const data = await platformAnalyticsService.getOrgHealth(limit);
    const response: VaasApiResponse = { success: true, data };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

/**
 * GET /api/platform/analytics/webhook-health?days=7
 * Webhook delivery stats per org over the given period.
 */
router.get('/webhook-health', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 7, 1), 90);
    const data = await platformAnalyticsService.getWebhookHealth(days);
    const response: VaasApiResponse = { success: true, data };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

export default router;
