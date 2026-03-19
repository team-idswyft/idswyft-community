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
 * Extracts per-provider metrics from a session's `results` JSONB.
 *
 * OCR:      session reached OCR when results.ocr_data is present
 * Face:     session reached face matching when results.face_match_score is present
 * Liveness: session reached liveness when results.liveness_score is present
 *
 * Returns null if the session never reached this provider stage.
 */
function extractProviderData(
  provider: string,
  session: any
): { success: boolean; confidence: number | null } | null {
  const results = session.results;
  if (!results) return null;

  switch (provider) {
    case 'ocr': {
      if (results.ocr_data == null) return null;
      // OCR succeeded if data was extracted (ocr_data exists and session didn't fail on OCR)
      const ocrFailed = Array.isArray(results.failure_reasons) &&
        results.failure_reasons.some((r: string) => /ocr|document|unreadable/i.test(r));
      return {
        success: !ocrFailed,
        confidence: results.confidence_score ?? null,
      };
    }

    case 'face': {
      const score = results.face_match_score;
      if (score == null) return null;
      return {
        success: Number(score) >= 0.6,
        confidence: Number(score),
      };
    }

    case 'liveness': {
      const livenessScore = results.liveness_score;
      if (livenessScore == null) return null;
      return {
        success: results.liveness_passed === true || Number(livenessScore) >= 0.7,
        confidence: Number(livenessScore),
      };
    }

    default:
      return null;
  }
}

/**
 * GET /api/platform/provider-metrics?provider=ocr|face|liveness&days=7&organization_id=UUID
 *
 * Cross-org aggregate metrics for the requested provider.
 * Derives per-provider stats from the results JSONB on each session.
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
      .select('id, status, confidence_score, results, submitted_at, completed_at, created_at')
      .gte('created_at', since);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Filter to sessions that actually reached this provider stage
    const providerRows: { success: boolean; confidence: number | null; session: any }[] = [];
    for (const s of sessions || []) {
      const pd = extractProviderData(provider, s);
      if (pd) providerRows.push({ ...pd, session: s });
    }

    const totalRequests = providerRows.length;
    const successCount = providerRows.filter(r => r.success).length;
    const successRate = totalRequests > 0 ? successCount / totalRequests : 0;

    // Latency: use submitted_at → completed_at (processing time after user submitted).
    // Falls back to created_at → completed_at if submitted_at is missing.
    let avgLatencyMs = 0;
    const latencyRows = providerRows.filter(r => r.session.completed_at);
    if (latencyRows.length > 0) {
      const totalMs = latencyRows.reduce((sum, r) => {
        const start = r.session.submitted_at || r.session.created_at;
        return sum + (new Date(r.session.completed_at).getTime() - new Date(start).getTime());
      }, 0);
      avgLatencyMs = Math.round(totalMs / latencyRows.length);
    }

    // Confidence: use per-provider confidence where available, fall back to session-level
    let avgConfidence = 0;
    const scored = providerRows.filter(r => r.confidence != null);
    if (scored.length > 0) {
      avgConfidence = scored.reduce((sum, r) => sum + r.confidence!, 0) / scored.length;
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
