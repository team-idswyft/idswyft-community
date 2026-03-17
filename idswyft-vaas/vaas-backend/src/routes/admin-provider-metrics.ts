import { Router } from 'express';
import { vaasSupabase } from '../config/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { VaasApiResponse } from '../types/index.js';

const router = Router();

const PROVIDER_NAMES: Record<string, string> = {
  ocr: 'PaddleOCR',
  face: 'Face Recognition',
  liveness: 'Liveness Detection',
};

/**
 * GET /api/admin/provider-metrics?provider=ocr|face|liveness&days=7
 *
 * Returns aggregate metrics for the requested verification provider,
 * derived from vaas_verification_sessions for the authenticated admin's org.
 */
router.get('/', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.admin!;
    const provider = (req.query.provider as string) || 'ocr';
    const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 7, 1), 365);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Fetch sessions within date range for this org
    const { data: sessions, error } = await vaasSupabase
      .from('vaas_verification_sessions')
      .select('id, status, confidence_score, created_at, completed_at')
      .eq('organization_id', admin.organization_id)
      .gte('created_at', since);

    if (error) {
      throw new Error(error.message);
    }

    const rows = sessions || [];
    const totalRequests = rows.length;

    // Success = verified or completed
    const successCount = rows.filter(
      (r: any) => r.status === 'verified' || r.status === 'completed'
    ).length;
    const successRate = totalRequests > 0 ? successCount / totalRequests : 0;

    // Average latency (ms) for sessions that have a completed_at timestamp
    let avgLatencyMs = 0;
    const completedRows = rows.filter((r: any) => r.completed_at && r.created_at);
    if (completedRows.length > 0) {
      const totalMs = completedRows.reduce((sum: number, r: any) => {
        return sum + (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime());
      }, 0);
      avgLatencyMs = Math.round(totalMs / completedRows.length);
    }

    // Average confidence score (only non-null values)
    let avgConfidence = 0;
    const scoredRows = rows.filter((r: any) => r.confidence_score != null);
    if (scoredRows.length > 0) {
      const totalScore = scoredRows.reduce((sum: number, r: any) => sum + Number(r.confidence_score), 0);
      avgConfidence = totalScore / scoredRows.length;
    }

    const result = {
      totalRequests,
      successRate: Math.round(successRate * 10000) / 10000, // 4 decimal precision
      avgLatencyMs,
      avgConfidence: Math.round(avgConfidence * 10000) / 10000,
      providerName: PROVIDER_NAMES[provider] || provider,
    };

    const response: VaasApiResponse = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'PROVIDER_METRICS_FAILED', message: err.message },
    } as VaasApiResponse);
  }
});

export default router;
