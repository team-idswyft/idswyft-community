/**
 * Platform System Status API
 *
 * Aggregates health checks from all services for platform admin monitoring.
 */

import { Router } from 'express';
import { requirePlatformAdmin, PlatformAdminRequest } from '../middleware/platformAuth.js';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';

const router = Router();

interface ServiceStatus {
  service: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number;
  details?: string;
  checked_at: string;
}

// ── In-memory ring buffer for status history ────────────────────────────────
const STATUS_HISTORY_SIZE = 100;
const statusHistory: Array<{ services: ServiceStatus[]; overall: string; checked_at: string }> = [];

function pushStatusHistory(entry: { services: ServiceStatus[]; overall: string; checked_at: string }) {
  statusHistory.push(entry);
  if (statusHistory.length > STATUS_HISTORY_SIZE) {
    statusHistory.shift();
  }
}

/** Check a single service with timeout */
async function checkService(name: string, checkFn: () => Promise<string | undefined>): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const details = await checkFn();
    clearTimeout(timeout);

    const latency = Date.now() - start;
    return {
      service: name,
      status: latency > 3000 ? 'degraded' : 'operational',
      latency_ms: latency,
      details,
      checked_at: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      service: name,
      status: 'down',
      latency_ms: Date.now() - start,
      details: err.message || 'Health check failed',
      checked_at: new Date().toISOString(),
    };
  }
}

/**
 * GET /api/platform/status
 * Aggregate health from all services
 */
router.get('/', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  try {
    const checks = await Promise.all([
      // VaaS Backend — self health (DB ping)
      checkService('VaaS API', async () => {
        const { count, error } = await vaasSupabase
          .from('vaas_organizations')
          .select('*', { count: 'exact', head: true });
        if (error) throw new Error('VaaS DB query failed');
        return `${count ?? 0} organizations`;
      }),

      // VaaS Database — direct query
      checkService('VaaS Database', async () => {
        const { error } = await vaasSupabase
          .from('vaas_admins')
          .select('id', { count: 'exact', head: true });
        if (error) throw new Error('VaaS DB unreachable');
        return 'Connected';
      }),

      // Main API — HTTP health check
      checkService('Main API', async () => {
        const baseUrl = config.idswyftApi.baseUrl || 'https://api.idswyft.app';
        const response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.status || 'reachable';
      }),

      // Main API Database (proxied through Main API /api/health)
      checkService('Main Database', async () => {
        const baseUrl = config.idswyftApi.baseUrl || 'https://api.idswyft.app';
        const response = await fetch(`${baseUrl}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.status || 'reachable';
      }),
    ]);

    const downCount = checks.filter((c) => c.status === 'down').length;
    const degradedCount = checks.filter((c) => c.status === 'degraded').length;

    let overall: 'operational' | 'degraded' | 'down' = 'operational';
    if (downCount > 0) overall = degradedCount + downCount === checks.length ? 'down' : 'degraded';
    else if (degradedCount > 0) overall = 'degraded';

    const entry = {
      services: checks,
      overall,
      checked_at: new Date().toISOString(),
    };

    pushStatusHistory(entry);

    res.json({ success: true, data: entry });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_CHECK_FAILED', message: err.message },
    });
  }
});

/**
 * GET /api/platform/status/history
 * Recent status check history (in-memory ring buffer)
 */
router.get('/history', requirePlatformAdmin as any, async (req: PlatformAdminRequest, res) => {
  res.json({
    success: true,
    data: statusHistory.slice().reverse(), // newest first
  });
});

export default router;
