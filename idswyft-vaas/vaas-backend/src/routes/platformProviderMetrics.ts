import { Router } from 'express';
import { vaasSupabase } from '../config/database.js';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { VaasApiResponse } from '../types/index.js';

const router = Router();

const PROVIDER_NAMES: Record<string, string> = {
  ocr: 'PaddleOCR',
  face: 'Face Recognition',
  liveness: 'Liveness Detection',
};

/**
 * GET /api/platform/provider-metrics?provider=ocr|face|liveness&days=7&organization_id=UUID
 *
 * Cross-org aggregate metrics for the requested provider.
 * Optional `organization_id` query param to filter by a single org.
 */
router.get('/', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const provider = (req.query.provider as string) || 'ocr';
    const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 7, 1), 365);
    const organizationId = req.query.organization_id as string | undefined;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status, confidence_score, created_at, completed_at')
      .gte('created_at', since);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const rows = sessions || [];
    const totalRequests = rows.length;

    const successCount = rows.filter(
      (r: any) => r.status === 'verified' || r.status === 'completed'
    ).length;
    const successRate = totalRequests > 0 ? successCount / totalRequests : 0;

    let avgLatencyMs = 0;
    const completedRows = rows.filter((r: any) => r.completed_at && r.created_at);
    if (completedRows.length > 0) {
      const totalMs = completedRows.reduce((sum: number, r: any) => {
        return sum + (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime());
      }, 0);
      avgLatencyMs = Math.round(totalMs / completedRows.length);
    }

    let avgConfidence = 0;
    const scoredRows = rows.filter((r: any) => r.confidence_score != null);
    if (scoredRows.length > 0) {
      const totalScore = scoredRows.reduce((sum: number, r: any) => sum + Number(r.confidence_score), 0);
      avgConfidence = totalScore / scoredRows.length;
    }

    const result = {
      totalRequests,
      successRate: Math.round(successRate * 10000) / 10000,
      avgLatencyMs,
      avgConfidence: Math.round(avgConfidence * 10000) / 10000,
      providerName: PROVIDER_NAMES[provider] || provider,
    };

    const response: VaasApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'PROVIDER_METRICS_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

export default router;
