/**
 * Platform System Status API
 *
 * DB-backed status endpoints powered by HealthCheckService.
 * The service runs checks every 5 min and persists to service_status_checks.
 */

import { Router } from 'express';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { healthCheckService } from '../services/healthCheckService.js';

const router = Router();

/**
 * GET /api/platform/status
 * Latest health status per service (from DB)
 */
router.get('/', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const services = await healthCheckService.getLatestStatus();

    const downCount = services.filter((c) => c.status === 'down').length;
    const degradedCount = services.filter((c) => c.status === 'degraded').length;

    let overall: 'operational' | 'degraded' | 'down' = 'operational';
    if (downCount > 0) overall = degradedCount + downCount === services.length ? 'down' : 'degraded';
    else if (degradedCount > 0) overall = 'degraded';

    res.json({
      success: true,
      data: {
        services,
        overall,
        checked_at: services[0]?.checked_at ?? new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_CHECK_FAILED', message: err.message },
    });
  }
});

/**
 * GET /api/platform/status/history
 * 30-day daily aggregated status summary
 */
router.get('/history', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const summary = await healthCheckService.getDailySummary(days);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_HISTORY_FAILED', message: err.message },
    });
  }
});

export default router;
