/**
 * Persistent Health Check Service
 *
 * Runs scheduled health checks every 5 minutes, persists results to
 * `service_status_checks` table, and provides query methods for
 * latest status and 30-day daily summaries.
 * Includes a daily cleanup job to purge records older than 30 days.
 */

import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { platformNotificationService } from './platformNotificationService.js';
import type { PlatformNotificationSeverity } from '../types/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  service: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number;
  details?: string;
  checked_at: string;
}

export interface DailySummary {
  day: string;
  service: string;
  total: number;
  operational: number;
  degraded: number;
  down_count: number;
}

// ── Check helper (extracted from platformStatus.ts) ──────────────────────────

async function checkService(
  name: string,
  checkFn: () => Promise<string | undefined>,
): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const details = await checkFn();
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

// ── Service ──────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 300_000; // 5 minutes
const CLEANUP_INTERVAL_MS = 86_400_000; // 24 hours
const RETENTION_DAYS = 30;

export class HealthCheckService {
  private static instance: HealthCheckService;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private previousStates: Map<string, string> = new Map();

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /** Start the background check loop (runs immediately, then every 5 min) and daily cleanup. */
  start(): void {
    if (this.intervalId) return; // already running
    console.log('[HealthCheck] Starting persistent health check service (every 5 min, 30-day retention)');
    this.runChecks(); // first check immediately
    this.intervalId = setInterval(() => this.runChecks(), CHECK_INTERVAL_MS);

    // Daily cleanup of old records
    this.cleanupOldChecks(); // run immediately on startup
    this.cleanupIntervalId = setInterval(() => this.cleanupOldChecks(), CLEANUP_INTERVAL_MS);
  }

  /** Stop the background check loop and cleanup job. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    console.log('[HealthCheck] Stopped');
  }

  /** Delete status check rows older than RETENTION_DAYS. */
  async cleanupOldChecks(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffISO = cutoff.toISOString();

    const { error, count } = await vaasSupabase
      .from('service_status_checks')
      .delete()
      .lt('checked_at', cutoffISO);

    if (error) {
      console.error('[HealthCheck] Cleanup failed:', error.message);
    } else {
      console.log(`[HealthCheck] Cleanup: deleted ${count ?? 0} rows older than ${RETENTION_DAYS} days`);
    }
  }

  /** Execute all service checks and persist to DB. */
  async runChecks(): Promise<ServiceStatus[]> {
    const checks = await Promise.all([
      checkService('VaaS API', async () => {
        const { count, error } = await vaasSupabase
          .from('vaas_organizations')
          .select('*', { count: 'exact', head: true });
        if (error) throw new Error('VaaS DB query failed');
        return `${count ?? 0} organizations`;
      }),

      checkService('VaaS Database', async () => {
        const { error } = await vaasSupabase
          .from('vaas_admins')
          .select('id', { count: 'exact', head: true });
        if (error) throw new Error('VaaS DB unreachable');
        return 'Connected';
      }),

      checkService('Main API', async () => {
        const baseUrl = config.idswyftApi.baseUrl || 'https://api.idswyft.app';
        const response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.status || 'reachable';
      }),

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

    // Persist to DB (fire-and-forget — failure must not break the service)
    const rows = checks.map((c) => ({
      service: c.service,
      status: c.status,
      latency_ms: c.latency_ms,
      details: c.details ?? null,
      checked_at: c.checked_at,
    }));

    vaasSupabase
      .from('service_status_checks')
      .insert(rows)
      .then(({ error }) => {
        if (error) console.error('[HealthCheck] Failed to persist checks:', error.message);
      });

    // Emit notifications on state transitions only
    for (const check of checks) {
      const prev = this.previousStates.get(check.service);
      this.previousStates.set(check.service, check.status);

      if (prev && prev !== check.status) {
        const severity: PlatformNotificationSeverity =
          check.status === 'down' ? 'critical' :
          check.status === 'degraded' ? 'warning' : 'info';

        const eventType =
          check.status === 'down' ? 'health.service_down' as const :
          check.status === 'degraded' ? 'health.service_degraded' as const :
          'health.service_recovered' as const;

        platformNotificationService.emit({
          type: eventType,
          severity,
          title: `${check.service} ${check.status === 'operational' ? 'recovered' : check.status}`,
          message: `${check.service} transitioned from ${prev} to ${check.status}. ${check.details || ''}`.trim(),
          source: 'health-check',
          metadata: { service: check.service, previous: prev, current: check.status, latency_ms: check.latency_ms },
        }).catch(() => {}); // fire-and-forget
      }
    }

    return checks;
  }

  /** Get the latest check per service (for real-time display). */
  async getLatestStatus(): Promise<ServiceStatus[]> {
    // DISTINCT ON is not available via Supabase JS — use a sorted query
    // and deduplicate in JS (4 services × 1 row each is trivial).
    const { data, error } = await vaasSupabase
      .from('service_status_checks')
      .select('service, status, latency_ms, details, checked_at')
      .order('checked_at', { ascending: false })
      .limit(20); // enough to cover all 4 services even with slight timing gaps

    if (error || !data || data.length === 0) {
      // Fallback: run live checks if no DB data yet
      return this.runChecks();
    }

    // Deduplicate: keep only the latest row per service
    const seen = new Set<string>();
    const latest: ServiceStatus[] = [];
    for (const row of data) {
      if (!seen.has(row.service)) {
        seen.add(row.service);
        latest.push(row as ServiceStatus);
      }
    }
    return latest;
  }

  /** Get 30-day daily summary via the PostgreSQL aggregate function. */
  async getDailySummary(days: number = 30): Promise<DailySummary[]> {
    const { data, error } = await vaasSupabase.rpc('get_daily_status_summary', {
      days_back: days,
    });

    if (error) {
      console.error('[HealthCheck] getDailySummary RPC error:', error.message);
      return [];
    }

    return (data as DailySummary[]) || [];
  }
}

export const healthCheckService = HealthCheckService.getInstance();
