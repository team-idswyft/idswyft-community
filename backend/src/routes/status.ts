/**
 * Public Status Route
 *
 * No authentication required — provides a minimal public view
 * of service health for end users.
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';

const router = Router();

interface ServiceCheck {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number;
}

/**
 * GET /api/status
 * Public endpoint — no auth required
 */
router.get('/', async (req: Request, res: Response) => {
  const requestStart = Date.now();
  const services: ServiceCheck[] = [];

  // Check Main API database connectivity
  const dbStart = Date.now();
  try {
    const { error } = await supabase
      .from('developers')
      .select('id', { count: 'exact', head: true });
    const latency = Date.now() - dbStart;
    services.push({
      name: 'Database',
      status: error ? 'degraded' : latency > 3000 ? 'degraded' : 'operational',
      latency_ms: latency,
    });
  } catch {
    services.push({
      name: 'Database',
      status: 'down',
      latency_ms: Date.now() - dbStart,
    });
  }

  // API self-check: measure total request processing time
  services.unshift({
    name: 'API',
    status: 'operational',
    latency_ms: Date.now() - requestStart,
  });

  // Determine overall status
  const downCount = services.filter((s) => s.status === 'down').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;

  let overall: 'operational' | 'degraded' | 'down' = 'operational';
  if (downCount === services.length) overall = 'down';
  else if (downCount > 0 || degradedCount > 0) overall = 'degraded';

  res.json({
    overall,
    services,
    checked_at: new Date().toISOString(),
  });
});

export default router;
