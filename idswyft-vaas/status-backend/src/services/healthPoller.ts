import { statusDb } from '../config/database.js';
import config from '../config/index.js';
import { cronReporter } from './cronReporter.js';
import type { MonitoredService, OverallStatus } from '../types/index.js';

interface CheckResult {
  service: string;
  name: string;
  status: OverallStatus;
  latency_ms: number;
  details: string | null;
}

export class HealthPoller {
  private static instance: HealthPoller;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  static getInstance(): HealthPoller {
    if (!HealthPoller.instance) {
      HealthPoller.instance = new HealthPoller();
    }
    return HealthPoller.instance;
  }

  async checkService(svc: MonitoredService): Promise<CheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(svc.healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      const latency = Date.now() - start;

      if (!response.ok) {
        return { service: svc.id, name: svc.name, status: 'down', latency_ms: latency, details: `HTTP ${response.status}` };
      }

      const status: OverallStatus = latency >= 2000 ? 'degraded' : 'operational';
      return { service: svc.id, name: svc.name, status, latency_ms: latency, details: null };
    } catch (err: any) {
      return {
        service: svc.id,
        name: svc.name,
        status: 'down',
        latency_ms: Date.now() - start,
        details: err.message || 'Unknown error',
      };
    }
  }

  async checkAllServices(): Promise<CheckResult[]> {
    const results = await Promise.allSettled(
      config.monitoredServices.map((svc) => this.checkService(svc))
    );

    return results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { service: 'unknown', name: 'Unknown', status: 'down' as const, latency_ms: 0, details: 'Check failed' }
    );
  }

  async runAndPersist(): Promise<void> {
    const results = await this.checkAllServices();
    const rows = results.map((r) => ({
      service: r.service,
      status: r.status,
      latency_ms: r.latency_ms,
      details: r.details,
    }));

    const { error } = await statusDb.from('service_checks').insert(rows);
    if (error) {
      console.error('[HealthPoller] Failed to persist checks:', error.message);
    }
  }

  start(): void {
    if (this.intervalId) return;
    console.log(`[HealthPoller] Starting (every ${config.pollIntervalMs}ms)`);

    this.runAndPersist()
      .then(() => cronReporter.report('status-health-poller', 'success'))
      .catch((err) => cronReporter.report('status-health-poller', 'error', err.message));

    this.intervalId = setInterval(async () => {
      try {
        await this.runAndPersist();
        cronReporter.report('status-health-poller', 'success');
      } catch (err: any) {
        cronReporter.report('status-health-poller', 'error', err.message);
      }
    }, config.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[HealthPoller] Stopped');
    }
  }

  /** Get latest check per service from DB */
  async getLatestStatus(): Promise<CheckResult[]> {
    const services = config.monitoredServices;
    const results: CheckResult[] = [];

    for (const svc of services) {
      const { data, error } = await statusDb
        .from('service_checks')
        .select('*')
        .eq('service', svc.id)
        .order('checked_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        results.push({ service: svc.id, name: svc.name, status: 'down', latency_ms: 0, details: 'No data' });
      } else {
        results.push({
          service: data[0].service,
          name: svc.name,
          status: data[0].status,
          latency_ms: data[0].latency_ms,
          details: data[0].details,
        });
      }
    }
    return results;
  }

  deriveOverall(checks: CheckResult[]): OverallStatus {
    if (checks.some((c) => c.status === 'down')) return 'down';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'operational';
  }
}

export const healthPoller = HealthPoller.getInstance();
