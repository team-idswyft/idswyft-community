/**
 * Public Status API — no authentication required.
 *
 * Provides the same status data as the platform admin endpoints
 * but strips internal details for public consumption.
 */

import { Router } from 'express';
import { healthCheckService } from '../services/healthCheckService.js';

const router = Router();

/**
 * GET /api/public/status
 * Current service status (public-safe, no details field)
 */
router.get('/', async (_req, res) => {
  try {
    const services = await healthCheckService.getLatestStatus();

    const downCount = services.filter((c) => c.status === 'down').length;
    const degradedCount = services.filter((c) => c.status === 'degraded').length;

    let overall: 'operational' | 'degraded' | 'down' = 'operational';
    if (downCount > 0) overall = degradedCount + downCount === services.length ? 'down' : 'degraded';
    else if (degradedCount > 0) overall = 'degraded';

    // Strip details for public consumers
    const publicServices = services.map(({ service, status, latency_ms, checked_at }) => ({
      service,
      status,
      latency_ms,
      checked_at,
    }));

    res.json({
      services: publicServices,
      overall,
      checked_at: services[0]?.checked_at ?? new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * GET /api/public/status/history
 * 30-day daily summary (public-safe)
 */
router.get('/history', async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const summary = await healthCheckService.getDailySummary(days);

    // Return only aggregate counts — no details
    const publicSummary = summary.map(({ day, service, total, operational, degraded, down_count }) => ({
      day,
      service,
      total,
      operational,
      degraded,
      down_count,
    }));

    res.json({ data: publicSummary });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

export default router;
