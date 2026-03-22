import { Router } from 'express';
import { healthPoller } from '../services/healthPoller.js';
import { statusDb } from '../config/database.js';
import type { ApiResponse, StatusResponse, DailySummary } from '../types/index.js';

const router = Router();

// GET /api/status — current status of all services
router.get('/', async (_req, res) => {
  try {
    const checks = await healthPoller.getLatestStatus();
    const overall = healthPoller.deriveOverall(checks);

    const response: ApiResponse<StatusResponse> = {
      success: true,
      data: {
        overall,
        services: checks.map((c) => ({
          id: c.service,
          name: c.name,
          status: c.status,
          latency_ms: c.latency_ms,
        })),
        checked_at: new Date().toISOString(),
      },
    };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// GET /api/status/history?days=30 — daily rollup per service
router.get('/history', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 30);
    const { data, error } = await statusDb.rpc('get_daily_status_summary', { days_back: days });

    if (error) throw error;

    const response: ApiResponse<DailySummary[]> = { success: true, data: data || [] };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
